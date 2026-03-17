import React, { useState } from 'react';
import { User, Mail, Phone, MapPin, Building2, Briefcase, School, Key, Edit2, Save, X } from 'lucide-react';

interface BrandingUser {
  username: string;
  fullName: string;
  staffId: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  designation: string;
  collegeCode: string;
  collegeName: string;
  collegeShortName: string;
  collegeAddress: string;
  role: string;
  bio: string;
}

const DEFAULT_USER: BrandingUser = {
  username: 'Branding',
  fullName: 'Branding Officer',
  staffId: '000000',
  email: 'branding@krct.ac.in',
  phone: '+91 98765 43210',
  department: 'Marketing & Branding',
  location: 'KRCT College, Samayapuram, Trichy',
  designation: 'Branding Officer',
  collegeCode: '3701',
  collegeName: 'K Ramakrishnan College of Technology (Autonomous)',
  collegeShortName: 'KRCT',
  collegeAddress: 'Samayapuram, Trichy - 621112, Tamil Nadu, India',
  role: 'Branding',
  bio: 'Responsible for managing the college brand identity, event posters, announcements, and digital media content.',
};

export default function BrandingProfilePage() {
  const stored = localStorage.getItem('branding_profile') || localStorage.getItem('me') || '';
  let storedObj: any = null;
  try { storedObj = stored ? JSON.parse(stored) : null; } catch { storedObj = null; }

  const fromMe: Partial<BrandingUser> = storedObj && storedObj.username ? {
    username: String(storedObj.username || DEFAULT_USER.username),
    email: String(storedObj.email || DEFAULT_USER.email),
    staffId: String(storedObj?.profile?.staff_id || storedObj?.staff_id || DEFAULT_USER.staffId),
    phone: String(storedObj?.profile?.mobile_number || storedObj?.mobile_number || DEFAULT_USER.phone),
    department: String(storedObj?.profile?.department?.short_name || storedObj?.profile?.department?.code || DEFAULT_USER.department),
    designation: String(storedObj?.profile?.designation || DEFAULT_USER.designation),
    fullName: String(
      storedObj?.profile?.full_name || storedObj?.profile?.fullName || storedObj?.full_name || storedObj?.fullName || DEFAULT_USER.fullName,
    ),
    role: String(Array.isArray(storedObj?.roles) && storedObj.roles.length ? storedObj.roles[0] : (storedObj?.role || DEFAULT_USER.role)),
  } : {};

  const initial: BrandingUser = storedObj ? { ...DEFAULT_USER, ...fromMe, ...storedObj } : { ...DEFAULT_USER, ...fromMe };

  const [user, setUser] = useState<BrandingUser>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrandingUser>(initial);

  function handleSave() {
    setUser(draft);
    localStorage.setItem('branding_profile', JSON.stringify(draft));
    setEditing(false);
  }

  function handleCancel() {
    setDraft(user);
    setEditing(false);
  }

  function field(label: string, key: keyof BrandingUser, icon: React.ElementType, multiline = false) {
    const Icon = icon;
    return (
      <div key={key}>
        <label className="text-sm font-semibold text-gray-500 mb-1 flex items-center gap-1.5">
          <Icon className="w-4 h-4" /> {label}
        </label>
        {editing ? (
          multiline ? (
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          ) : (
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          )
        ) : (
          <p className="text-gray-900 font-medium text-sm">{user[key] || '—'}</p>
        )}
      </div>
    );
  }

  const initials = (user.fullName || user.username || 'BR').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 pb-8">
      <div className="bg-white rounded-xl p-5 shadow-md mb-6 border border-gray-100">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-4xl font-bold text-gray-900 leading-none mb-2">{user.username || 'Branding'}</h2>
            <p className="text-gray-600 text-xl">{user.email || '—'}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-right shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Profile Type</div>
            <div className="text-2xl font-bold text-gray-900">STAFF</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-3xl font-bold text-gray-900 mb-4">Details</h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100">
            {field('Staff ID', 'staffId', User)}
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100">
            {field('Username & Name', 'username', User)}
            <div className="mt-3">
              {field('Name', 'fullName', User)}
            </div>
            <div className="mt-3">
              {!editing ? (
                <button
                  onClick={() => { setDraft(user); setEditing(true); }}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                  >
                    <Save className="w-3 h-3" /> Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100">
            {field('Email', 'email', Mail)}
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100">
            {field('Roles', 'role', User)}
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100">
            {field('Department', 'department', Building2)}
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100">
            {field('Designation', 'designation', Briefcase)}
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100 lg:col-span-3">
            <div className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
              <School className="w-4 h-4" /> College
            </div>
            <div className="space-y-1 text-sm">
              <div><span className="font-semibold text-gray-500 w-24 inline-block">Code:</span> <span className="text-gray-900 font-medium">{user.collegeCode || '—'}</span></div>
              <div><span className="font-semibold text-gray-500 w-24 inline-block">Name:</span> <span className="text-gray-900 font-medium">{user.collegeName || '—'}</span></div>
              <div><span className="font-semibold text-gray-500 w-24 inline-block">Short Name:</span> <span className="text-gray-900 font-medium">{user.collegeShortName || '—'}</span></div>
              <div><span className="font-semibold text-gray-500 w-24 inline-block">Address:</span> <span className="text-gray-900 font-medium">{user.collegeAddress || '—'}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100 lg:col-span-2">
            {field('Mobile Number', 'phone', Phone)}
            <div className="mt-2 text-xs text-gray-500">Current number</div>
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100">
            <div className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
              <Key className="w-4 h-4" /> Password
            </div>
            <div className="text-gray-900 font-medium mb-3">••••••••</div>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 transition-colors">
              Change Password
            </button>
          </div>

          <div className="bg-white rounded-lg p-5 shadow-md border border-gray-100 lg:col-span-3">
            {field('Location', 'location', MapPin)}
            <div className="mt-3">
              {field('Bio', 'bio', Edit2, true)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
