/**
 * Visual Admin Dashboard
 * Analytics and statistics for Power BI URL management
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3, Link2, Users, CheckCircle, AlertCircle, ExternalLink,
  BookOpen, Settings, TrendingUp, Activity, PieChart, Globe,
} from 'lucide-react';
import { fetchVADashboardStats, type VADashboardStats } from '../../services/visualAdmin';

export default function VisualAdminDashboard() {
  const [stats, setStats] = useState<VADashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchVADashboardStats()
      .then(setStats)
      .catch(() => setError('Failed to load statistics'))
      .finally(() => setLoading(false));
  }, []);

  const coveragePct = stats
    ? Math.round((stats.staff_with_link / Math.max(stats.total_staff, 1)) * 100)
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={28} className="text-indigo-600" />
          Visual Admin Dashboard
        </h1>
        <p className="text-gray-500 mt-1">
          Overview of Power BI URL assignments and faculty coverage
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 flex items-center gap-2">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<Users size={22} className="text-blue-600" />}
              label="Total Active Staff"
              value={stats.total_staff}
              bg="bg-blue-50"
              border="border-blue-200"
            />
            <StatCard
              icon={<CheckCircle size={22} className="text-green-600" />}
              label="Staff with Link"
              value={stats.staff_with_link}
              sub={`${coveragePct}% coverage`}
              bg="bg-green-50"
              border="border-green-200"
            />
            <StatCard
              icon={<AlertCircle size={22} className="text-orange-500" />}
              label="No Link Assigned"
              value={stats.staff_no_link}
              sub="Will see 'Contact Visual Admin'"
              bg="bg-orange-50"
              border="border-orange-200"
            />
            <StatCard
              icon={<BookOpen size={22} className="text-purple-600" />}
              label="Course-Level Links"
              value={stats.total_course_links}
              bg="bg-purple-50"
              border="border-purple-200"
            />
            <StatCard
              icon={<Globe size={22} className="text-teal-600" />}
              label="Overall URL Only"
              value={stats.staff_with_overall_only}
              sub="Same URL for all courses"
              bg="bg-teal-50"
              border="border-teal-200"
            />
            <StatCard
              icon={<PieChart size={22} className="text-indigo-600" />}
              label="Per-Course URLs"
              value={stats.staff_with_course_urls}
              sub="Expanded per course"
              bg="bg-indigo-50"
              border="border-indigo-200"
            />
            <StatCard
              icon={<Settings size={22} className="text-gray-600" />}
              label="Visual Admins"
              value={stats.visual_admin_count}
              bg="bg-gray-50"
              border="border-gray-200"
            />
            <StatCard
              icon={<TrendingUp size={22} className="text-pink-600" />}
              label="Coverage"
              value={`${coveragePct}%`}
              sub={`${stats.staff_with_link} of ${stats.total_staff}`}
              bg="bg-pink-50"
              border="border-pink-200"
            />
          </div>

          {/* Coverage bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Activity size={18} className="text-indigo-500" />
              Faculty Link Coverage
            </h2>
            <div className="flex items-center gap-4 mb-3">
              <span className="text-sm text-gray-600 w-28">Configured</span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 w-12 text-right">{coveragePct}%</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 w-28">No link</span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-300 to-red-400 rounded-full transition-all duration-700"
                  style={{ width: `${100 - coveragePct}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 w-12 text-right">{100 - coveragePct}%</span>
            </div>
          </div>

          {/* Link type breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="text-base font-semibold text-gray-800 mb-5 flex items-center gap-2">
              <Link2 size={18} className="text-indigo-500" />
              Link Type Breakdown
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <BreakdownCard
                label="Overall URL (same for all courses)"
                count={stats.staff_with_overall_only}
                total={stats.total_staff}
                color="bg-teal-400"
              />
              <BreakdownCard
                label="Per-course URLs (expanded)"
                count={stats.staff_with_course_urls}
                total={stats.total_staff}
                color="bg-indigo-400"
              />
              <BreakdownCard
                label="No URL configured"
                count={stats.staff_no_link}
                total={stats.total_staff}
                color="bg-orange-400"
              />
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/visual-admin/urls"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Link2 size={16} />
                Manage Staff URLs
              </Link>
              <Link
                to="/visual-admin/urls?tab=staff"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Users size={16} />
                View Staff Links
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  icon, label, value, sub, bg, border,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  bg: string;
  border: string;
}) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function BreakdownCard({
  label, count, total, color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = Math.round((count / Math.max(total, 1)) * 100);
  return (
    <div className="border border-gray-100 rounded-lg p-4 bg-gray-50">
      <p className="text-xs text-gray-600 mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mb-2">{count}</p>
      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 mt-1">{pct}% of total staff</p>
    </div>
  );
}
