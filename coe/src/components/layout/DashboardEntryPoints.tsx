import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ClipboardList, FileText, GraduationCap, LayoutGrid, User } from 'lucide-react';

type EntryProps = {
  user?: any;
};

const ENTRY_POINTS = [
  { to: '/coe', label: 'COE Portal', note: 'COE module dashboard', icon: LayoutGrid },
  { to: '/coe/courses', label: 'Course List', note: 'Configure courses and exam mode', icon: BookOpen },
  { to: '/coe/students', label: 'Students List', note: 'Generate and manage student mappings', icon: GraduationCap },
  { to: '/coe/arrears', label: 'Arrear List', note: 'Manage arrear entries', icon: ClipboardList },
  { to: '/profile', label: 'Profile', note: 'Update account details and mobile verification', icon: User },
  { to: '/queries', label: 'Raise Token', note: 'Submit and track support tokens', icon: FileText },
];

export default function DashboardEntryPoints({ user }: EntryProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ENTRY_POINTS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-xl border border-[#ead7d0] bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[#f2dfd8] p-2">
                <Icon className="h-5 w-5 text-[#7a2038]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#4f1a2c]">{item.label}</p>
                <p className="mt-1 text-xs text-[#755348]">{item.note}</p>
              </div>
            </div>
          </Link>
        );
      })}
      {user?.profile_type ? (
        <div className="rounded-xl border border-[#e9cbbf] bg-[#fff8f4] p-4 sm:col-span-2 lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b4934]">Logged In As</p>
          <p className="mt-1 text-sm font-medium text-[#5b1a30]">{String(user.profile_type)}</p>
        </div>
      ) : null}
    </div>
  );
}
