import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BedDouble,
  Building2,
  Download,
  IndianRupee,
  LogOut,
  MessageSquareWarning,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as api from '../../../services/hostelOps';
import {
  Badge,
  Card,
  ErrorBanner,
  SectionTitle,
  Spinner,
  StatCard,
  btnSecondary,
  formatMoney,
} from '../HostelUI';

const OCCUPANCY_COLORS = ['#2563eb', '#e5e7eb'];

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DashboardModule() {
  const [data, setData] = useState<api.HostelDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.getHostelDashboard());
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const infrastructure = data?.infrastructure || {};
  const occupied = Number(infrastructure.occupied_beds || 0);
  const capacity = Number(infrastructure.configured_hostel_beds || 0);
  const vacant = Math.max(capacity - occupied, 0);
  const occupancyRate = capacity ? Math.round((occupied / capacity) * 100) : 0;

  const occupancyData = useMemo(
    () => [
      { name: 'Occupied', value: occupied },
      { name: 'Vacant', value: vacant },
    ],
    [occupied, vacant],
  );

  const trendData = useMemo(
    () =>
      (data?.complaints?.trend_last_7_days || []).map((row) => ({
        day: new Date(row.created_at__date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        complaints: row.count,
      })),
    [data],
  );

  const buildingData = useMemo(
    () =>
      (data?.by_building || []).map((row) => ({
        name: row.building__code || row.building__name,
        capacity: row.capacity,
        occupied: row.occupied,
        vacant: Math.max(Number(row.capacity || 0) - Number(row.occupied || 0), 0),
      })),
    [data],
  );

  if (loading) return <Spinner label="Building the dashboard…" />;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Hostel dashboard"
        subtitle={`Live operational snapshot · ${data?.generated_at ? new Date(data.generated_at).toLocaleString('en-IN') : ''}`}
        right={
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} onClick={load}>Refresh</button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() =>
                downloadCsv('hostel-building-distribution.csv', buildingData.map((row) => ({
                  block: row.name,
                  capacity: row.capacity,
                  occupied: row.occupied,
                  vacant: row.vacant,
                })))
              }
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Occupancy" value={`${occupancyRate}%`} hint={`${occupied} of ${capacity} beds`} icon={BedDouble} tone="blue" />
        <StatCard label="Hostellers" value={data?.students?.hostellers ?? 0} hint={`${data?.students?.day_scholars ?? 0} day scholars`} icon={Users} tone="green" />
        <StatCard label="Fee collection" value={`${data?.finance?.collection_rate ?? 0}%`} hint={`${formatMoney(data?.finance?.outstanding ?? 0)} outstanding`} icon={IndianRupee} tone="purple" />
        <StatCard label="Active complaints" value={data?.complaints?.active ?? 0} hint={`${data?.complaints?.resolved ?? 0} resolved`} icon={MessageSquareWarning} tone="amber" />
        <StatCard label="Visitors today" value={data?.movement?.visitors_today ?? 0} hint={`${data?.movement?.visitors_inside ?? 0} currently inside`} icon={ShieldCheck} tone="blue" />
        <StatCard label="Active leaves" value={data?.movement?.active_leaves ?? 0} hint={`${data?.movement?.pending_leaves ?? 0} pending approval`} icon={LogOut} tone="amber" />
        <StatCard label="Active gate passes" value={data?.movement?.active_gate_passes ?? 0} hint={`${data?.movement?.pending_gate_passes ?? 0} awaiting warden`} icon={ShieldCheck} tone="green" />
        <StatCard label="Late entries" value={data?.movement?.late_entries ?? 0} hint="Flagged at the gate" icon={AlertTriangle} tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <SectionTitle title="Bed occupancy" subtitle={`${vacant} vacant beds`} />
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={occupancyData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {occupancyData.map((entry, index) => (
                    <Cell key={entry.name} fill={OCCUPANCY_COLORS[index % OCCUPANCY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <SectionTitle title="Complaint trend" subtitle="New complaints in the last 7 days" />
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="complaints" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle title="Hostel-wise distribution" subtitle="Capacity vs occupied beds by block" />
        <div className="mt-3 space-y-3">
          {buildingData.map((row) => {
            const rate = row.capacity ? Math.round((row.occupied / row.capacity) * 100) : 0;
            return (
              <div key={row.name} className="rounded-xl border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <Badge tone="blue">{row.occupied} occupied</Badge>
                    <Badge tone="gray">{row.vacant} vacant</Badge>
                    <Badge tone={rate > 90 ? 'red' : rate > 70 ? 'amber' : 'green'}>{rate}%</Badge>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(rate, 100)}%` }} />
                </div>
              </div>
            );
          })}
          {buildingData.length === 0 ? <p className="text-sm text-gray-500">No hostel blocks configured.</p> : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle title="Mess snapshot" subtitle="Today" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-2xl font-bold text-emerald-700">{data?.mess?.booked_today ?? 0}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Opted in</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-2xl font-bold text-gray-700">{data?.mess?.opted_out_today ?? 0}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Opted out</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-2xl font-bold text-amber-700">{Number(data?.mess?.feedback_average ?? 0).toFixed(1)}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Avg rating</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle title="Quick report exports" subtitle="Download operational data" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => downloadCsv('hostel-department-distribution.csv', (data?.by_department || []).map((row) => ({
                department: row.home_department__name || row.home_department__code || 'Unassigned',
                students: row.total,
              })))}
            >
              <Download className="h-4 w-4" /> Department distribution
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => downloadCsv('hostel-complaint-trend.csv', trendData.map((row) => ({
                day: row.day,
                complaints: row.complaints,
              })))}
            >
              <Download className="h-4 w-4" /> Complaint trend
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => downloadCsv('hostel-capacity-summary.csv', [{
                capacity,
                occupied,
                vacant,
                occupancy_rate: `${occupancyRate}%`,
                hostellers: data?.students?.hostellers ?? 0,
                active_complaints: data?.complaints?.active ?? 0,
              }])}
            >
              <Download className="h-4 w-4" /> Capacity summary
            </button>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
            <Wrench className="mt-0.5 h-4 w-4" />
            Use the Inventory module to track damaged assets and the Movement hub for live gate activity.
          </div>
        </Card>
      </div>
    </div>
  );
}
