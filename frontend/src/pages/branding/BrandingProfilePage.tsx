import React, { useState } from 'react';
import { User, Mail, Phone, MapPin, Building2, Edit2, Save, X } from 'lucide-react';

interface BrandingUser {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  role: string;
  bio: string;
}

const DEFAULT_USER: BrandingUser = {
  username: '000001',
  fullName: 'Branding Officer',
  email: 'branding@idcscollege.edu.in',
  phone: '+91 98765 43210',
  department: 'Marketing & Branding',
  location: 'IDCS College, Chennai',
  role: 'Branding',
  bio: 'Responsible for managing the college brand identity, event posters, announcements, and digital media content.',
};

export default function BrandingProfilePage() {
  const stored = localStorage.getItem('branding_user');
  const initial: BrandingUser = stored ? { ...DEFAULT_USER, ...JSON.parse(stored) } : DEFAULT_USER;

  const [user, setUser] = useState<BrandingUser>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrandingUser>(initial);

  function handleSave() {
    setUser(draft);
    localStorage.setItem('branding_user', JSON.stringify(draft));
    setEditing(false);
  }

  function handleCancel() {
    setDraft(user);
    setEditing(false);
  }

  function field(label: string, key: keyof BrandingUser, icon: React.ElementType, multiline = false) {
    const Icon = icon;
    return (
      <div key={key} className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" /> {label}
        </label>
        {editing ? (
          multiline ? (
            <textarea
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={3}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          ) : (
            <input
              type="text"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          )
        ) : (
          <p className="text-gray-800 text-sm py-1">{user[key]}</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-500 text-sm mt-1">View and manage your Branding account details.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Avatar banner */}
        <div className="h-24 bg-gradient-to-r from-purple-600 to-indigo-600" />
        <div className="px-6 pb-6">
          <div className="flex items-end justify-between -mt-10 mb-6">
            <div className="w-20 h-20 rounded-2xl bg-white shadow-lg border-4 border-white flex items-center justify-center">
              <User className="w-10 h-10 text-purple-600" />
            </div>
            {!editing ? (
              <button
                onClick={() => { setDraft(user); setEditing(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
              >
                <Edit2 className="w-4 h-4" /> Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {field('Full Name',   'fullName',   User)}
            {field('Username',    'username',   User)}
            {field('Email',       'email',      Mail)}
            {field('Phone',       'phone',      Phone)}
            {field('Department',  'department', Building2)}
            {field('Location',    'location',   MapPin)}
            <div className="sm:col-span-2">
              {field('Bio',       'bio',        Edit2, true)}
            </div>
          </div>

          {/* Role badge */}
          <div className="mt-5 pt-5 border-t border-gray-100 flex items-center gap-2">
            <span className="text-xs text-gray-500">Role:</span>
            <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
              {user.role}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
