import React, { useState } from 'react';
import { PlusCircle, Image, Megaphone, Video, FileText, X, CheckCircle } from 'lucide-react';

type ContentType = 'Poster' | 'Announcement' | 'Media' | 'Article';

interface ContentEntry {
  id: string;
  type: ContentType;
  title: string;
  description: string;
  eventDate: string;
  createdAt: string;
}

const CONTENT_TYPES: { value: ContentType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'Poster',       label: 'Event Poster',   icon: Image,      color: 'bg-pink-100 text-pink-700 border-pink-200'    },
  { value: 'Announcement', label: 'Announcement',   icon: Megaphone,  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'Media',        label: 'Media Entry',    icon: Video,      color: 'bg-blue-100 text-blue-700 border-blue-200'    },
  { value: 'Article',      label: 'Article',        icon: FileText,   color: 'bg-green-100 text-green-700 border-green-200' },
];

const DUMMY_ENTRIES: ContentEntry[] = [
  { id: '1', type: 'Poster',       title: 'Annual Day 2024',           description: 'Poster for the grand annual day celebrations.', eventDate: '2024-12-20', createdAt: '2024-12-01T09:00:00Z' },
  { id: '2', type: 'Announcement', title: 'Freshers Welcome Notice',   description: 'Official announcement for the freshers welcome event.', eventDate: '2024-08-10', createdAt: '2024-08-01T10:30:00Z' },
  { id: '3', type: 'Media',        title: 'Tech Fest Highlights',       description: 'Video media entry for tech fest 2024 highlight reel.', eventDate: '2024-11-15', createdAt: '2024-11-10T14:00:00Z' },
];

const EMPTY_FORM = { type: 'Poster' as ContentType, title: '', description: '', eventDate: '' };

export default function BrandingCreatePage() {
  const [entries, setEntries] = useState<ContentEntry[]>(DUMMY_ENTRIES);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newEntry: ContentEntry = {
      id: Date.now().toString(),
      ...form,
      createdAt: new Date().toISOString(),
    };
    setEntries([newEntry, ...entries]);
    setForm(EMPTY_FORM);
    setShowForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const typeInfo = (type: ContentType) => CONTENT_TYPES.find((t) => t.value === type)!;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Content</h1>
          <p className="text-gray-500 text-sm mt-1">Create branding content for college events.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm"
        >
          <PlusCircle className="w-4 h-4" /> New Content
        </button>
      </div>

      {saved && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
          <CheckCircle className="w-4 h-4" /> Content created successfully!
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">New Branding Content</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Content type selector */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Content Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {CONTENT_TYPES.map(({ value, label, icon: Icon, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, type: value })}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                        ${form.type === value ? color + ' ring-2 ring-purple-500/50' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >
                      <Icon className="w-4 h-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Title</label>
                <input
                  required
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter content title..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Description</label>
                <textarea
                  required
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  placeholder="Describe the content..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Event Date</label>
                <input
                  required
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content list */}
      <div className="space-y-3">
        {entries.map((entry) => {
          const ti = typeInfo(entry.type);
          const Icon = ti.icon;
          return (
            <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ti.color.split(' ').slice(0, 2).join(' ')}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900 text-sm">{entry.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ti.color}`}>{entry.type}</span>
                </div>
                <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{entry.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                  <span>Event: {entry.eventDate}</span>
                  <span>·</span>
                  <span>Created: {new Date(entry.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <PlusCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No content yet. Click "New Content" to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
