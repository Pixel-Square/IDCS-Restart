import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import * as api from '../../services/hostel';
import {
  Allocation,
  Building,
  Complaint,
  DashboardSummary,
  FacilityChangeRequest,
  FeeStructure,
  Floor,
  HostelConfig,
  Lookup,
  Notice,
  Room,
  SelectionWindow,
  StudentBrief,
  StudentFee,
} from '../../services/hostel';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  KeyValue,
  Modal,
  SectionTitle,
  Spinner,
  StatCard,
  btnDanger,
  btnPrimary,
  btnSecondary,
  cx,
  formatDate,
  formatDateTime,
  formatMoney,
  inputClass,
  statusTone,
} from './HostelUI';

type TabKey =
  | 'dashboard'
  | 'students'
  | 'infrastructure'
  | 'allocations'
  | 'approvals'
  | 'complaints'
  | 'fees'
  | 'notices'
  | 'settings';

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'students', label: 'Students', icon: Users },
  { key: 'infrastructure', label: 'Buildings & Rooms', icon: Building2 },
  { key: 'allocations', label: 'Allocations', icon: BedDouble },
  { key: 'approvals', label: 'Approvals', icon: ClipboardList },
  { key: 'complaints', label: 'Complaints', icon: Wrench },
  { key: 'fees', label: 'Fees', icon: Wallet },
  { key: 'notices', label: 'Notices', icon: Bell },
  { key: 'settings', label: 'Settings', icon: Settings },
];

function listOf<T>(value: any): T[] {
  if (Array.isArray(value)) return value as T[];
  if (Array.isArray(value?.results)) return value.results as T[];
  return [];
}

function errorText(error: any) {
  return error?.message || 'Something went wrong.';
}

export default function HostelAdminPage() {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    let mounted = true;
    api
      .getLookups()
      .then((payload) => {
        if (mounted) setLookup(payload);
      })
      .catch((error) => {
        if (mounted) setBootError(errorText(error));
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Hostel &amp; Facilities</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Hostel Administration</h1>
            <p className="mt-1 text-sm text-slate-300">
              Students, buildings, allocations, fees, complaints and notices — all calculated from live records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={cx(btnSecondary, 'border-white/20 bg-white/10 text-white hover:bg-white/20')} onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" /> Reload
            </button>
          </div>
        </div>
      </header>

      <ErrorBanner message={bootError} />

      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cx(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition',
              tab === item.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? <DashboardTab /> : null}
      {tab === 'students' ? <StudentsTab lookup={lookup} /> : null}
      {tab === 'infrastructure' ? <InfrastructureTab lookup={lookup} /> : null}
      {tab === 'allocations' ? <AllocationsTab lookup={lookup} /> : null}
      {tab === 'approvals' ? <ApprovalsTab /> : null}
      {tab === 'complaints' ? <ComplaintsTab /> : null}
      {tab === 'fees' ? <FeesTab lookup={lookup} /> : null}
      {tab === 'notices' ? <NoticesTab lookup={lookup} /> : null}
      {tab === 'settings' ? <SettingsTab lookup={lookup} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

function DashboardTab() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await api.getDashboard());
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner label="Building dashboard…" />;

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onRetry={load} />
      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total students" value={summary.students.total} icon={Users} tone="blue" hint={`${summary.students.active} active`} />
            <StatCard label="Hostellers" value={summary.students.hostellers} icon={BedDouble} tone="purple" hint={`${summary.students.awaiting_hostel_allocation} awaiting allocation`} />
            <StatCard label="Day scholars" value={summary.students.day_scholars} icon={DoorOpen} tone="green" hint={`${summary.students.college_bus_users} use the bus`} />
            <StatCard label="Without selection" value={summary.students.without_residence_category} icon={AlertCircle} tone="amber" hint={`${summary.students.pending_change_requests} pending requests`} />
            <StatCard label="Buildings" value={summary.infrastructure.buildings} icon={Building2} tone="blue" hint={`${summary.infrastructure.hostel_buildings} hostels`} />
            <StatCard label="Floors / rooms" value={`${summary.infrastructure.floors} / ${summary.infrastructure.rooms}`} icon={LayoutDashboard} tone="gray" hint={`${summary.infrastructure.hostel_rooms} hostel rooms`} />
            <StatCard label="Configured beds" value={summary.infrastructure.configured_hostel_beds} icon={BedDouble} tone="purple" hint={`${summary.infrastructure.occupied_beds} occupied`} />
            <StatCard label="Vacant beds" value={summary.infrastructure.vacant_beds} icon={ShieldCheck} tone="green" hint="Available for allocation" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Boys hostellers"
              value={summary.students.male_hostellers ?? 0}
              icon={Users}
              tone="blue"
              hint={`${summary.infrastructure.boys_occupied_beds ?? 0}/${summary.infrastructure.boys_beds ?? 0} boys beds occupied`}
            />
            <StatCard
              label="Girls hostellers"
              value={summary.students.female_hostellers ?? 0}
              icon={Users}
              tone="purple"
              hint={`${summary.infrastructure.girls_occupied_beds ?? 0}/${summary.infrastructure.girls_beds ?? 0} girls beds occupied`}
            />
            <StatCard
              label="Boys hostel rooms"
              value={summary.infrastructure.boys_hostel_rooms ?? 0}
              icon={Building2}
              tone="blue"
              hint={`${summary.infrastructure.boys_vacant_beds ?? 0} vacant beds`}
            />
            <StatCard
              label="Girls hostel rooms"
              value={summary.infrastructure.girls_hostel_rooms ?? 0}
              icon={Building2}
              tone="purple"
              hint={`${summary.infrastructure.girls_vacant_beds ?? 0} vacant beds`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <SectionTitle title="Occupancy by building" subtitle="Capacity and active allocations" />
              <div className="mt-3 space-y-2">
                {summary.by_building.length === 0 ? (
                  <EmptyState icon={Building2} title="No hostel buildings" message="Create a hostel building under Buildings & Rooms." />
                ) : (
                  summary.by_building.map((row) => {
                    const pct = row.capacity ? Math.round((row.occupied / row.capacity) * 100) : 0;
                    return (
                      <div key={row.building__id} className="rounded-lg border border-gray-100 p-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-gray-900">
                            {row.building__code} · {row.building__name}
                            {row.building__hostel_category ? (
                              <Badge tone={row.building__hostel_category === 'GIRLS' ? 'purple' : 'blue'}>
                                {row.building__hostel_category}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="text-gray-500">
                            {row.occupied}/{row.capacity} ({pct}%)
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={cx('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500')}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <SectionTitle title="Students by department" />
              <div className="mt-3 space-y-1.5">
                {summary.by_department.length === 0 ? (
                  <EmptyState icon={Users} title="No student data" />
                ) : (
                  summary.by_department.map((row, index) => (
                    <div key={`${row.home_department__code || index}`} className="flex items-center justify-between rounded-lg border border-gray-100 px-2.5 py-2 text-xs">
                      <span className="font-medium text-gray-800">
                        {row.home_department__code || '—'} {row.home_department__name ? `· ${row.home_department__name}` : ''}
                      </span>
                      <Badge tone="blue">{row.total}</Badge>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Students                                                           */
/* ------------------------------------------------------------------ */

function StudentsTab({ lookup }: { lookup: Lookup | null }) {
  const [filters, setFilters] = useState({
    q: '',
    residence_category: '',
    gender: '',
    hostel_category: '',
    building: '',
    status: '',
  });
  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getStudents({ ...filters, page_size: 100 });
      setStudents(response.results || []);
      setCount(response.count || 0);
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    // Debounce directory searches so typing does not fire a request per key.
    const timer = window.setTimeout(() => {
      void load();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError('');
    try {
      const result = await api.importFacilityCsv(file);
      setImportResult(result);
      await load();
    } catch (importError: any) {
      setError(errorText(importError));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  className={cx(inputClass, 'pl-9')}
                  placeholder="Roll number, name or email"
                  value={filters.q}
                  onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                />
              </div>
            </Field>
          </div>
          <Field label="Residence">
            <select
              className={inputClass}
              value={filters.residence_category}
              onChange={(event) => setFilters((current) => ({ ...current, residence_category: event.target.value }))}
            >
              <option value="">All</option>
              <option value="HOSTELLER">Hostellers</option>
              <option value="DAY_SCHOLAR">Day scholars</option>
              <option value="NONE">Not selected</option>
            </select>
          </Field>
          <Field label="Gender">
            <select
              className={inputClass}
              value={filters.gender}
              onChange={(event) => setFilters((current) => ({ ...current, gender: event.target.value }))}
            >
              <option value="">All</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Hostel category">
            <select
              className={inputClass}
              value={filters.hostel_category}
              onChange={(event) => setFilters((current) => ({ ...current, hostel_category: event.target.value }))}
            >
              <option value="">All</option>
              <option value="BOYS">Boys hostel</option>
              <option value="GIRLS">Girls hostel</option>
              <option value="MIXED">Mixed</option>
            </select>
          </Field>
          <Field label="Building">
            <select
              className={inputClass}
              value={filters.building}
              onChange={(event) => setFilters((current) => ({ ...current, building: event.target.value }))}
            >
              <option value="">All</option>
              {(lookup?.buildings || []).map((building) => (
                <option key={building.id} value={building.id}>{building.code} · {building.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Student status">
            <select
              className={inputClass}
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="">All</option>
              {['ACTIVE', 'INACTIVE', 'ALUMNI', 'DEBAR'].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>
          <button type="button" className={btnSecondary} onClick={load}><RefreshCw className="h-4 w-4" /> Apply</button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <button type="button" className={btnPrimary} onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Import CSV
          </button>
        </div>
        {importResult ? (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            <p className="font-semibold">Import finished: {importResult.total_rows} rows</p>
            <p className="mt-1">
              Created {importResult.created_count} · Updated {importResult.updated_count} · Skipped{' '}
              {importResult.skipped_count} · Failed {importResult.failed_count}
            </p>
            {Array.isArray(importResult.errors) && importResult.errors.length ? (
              <ul className="mt-2 max-h-24 overflow-y-auto space-y-0.5">
                {importResult.errors.slice(0, 10).map((row: any, index: number) => (
                  <li key={index}>Row {row.row}: {row.error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>

      <ErrorBanner message={error} onRetry={load} />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <SectionTitle title="Student directory" subtitle={`${count} student(s)`} />
        </div>
        {loading ? (
          <Spinner />
        ) : students.length === 0 ? (
          <div className="p-4"><EmptyState icon={Users} title="No students found" message="Adjust the filters or import facility selections." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Gender</th>
                  <th className="px-3 py-2">Sem / Section</th>
                  <th className="px-3 py-2">Residence</th>
                  <th className="px-3 py-2">Bus</th>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Hostel</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50/70">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-gray-900">{student.name}</p>
                      <p className="text-[11px] text-gray-500">{student.reg_no}</p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{student.department?.short_name || student.department?.code || '—'}</td>
                    <td className="px-3 py-2.5">
                      {student.gender ? (
                        <Badge tone={student.gender === 'FEMALE' ? 'purple' : student.gender === 'MALE' ? 'blue' : 'gray'}>
                          {student.gender}
                        </Badge>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-600">Not set</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {student.semester ? `Sem ${student.semester}` : '—'} {student.section ? `· ${student.section}` : ''}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={student.residence_category === 'HOSTELLER' ? 'purple' : student.residence_category === 'DAY_SCHOLAR' ? 'green' : 'gray'}>
                        {student.residence_category ? student.residence_category.replace(/_/g, ' ') : 'Not selected'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">{student.uses_college_bus ? <Badge tone="blue">Bus</Badge> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {student.hostel ? `${student.hostel.building_code}/${student.hostel.room_number}` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {student.hostel?.hostel_category ? (
                        <Badge tone={student.hostel.hostel_category === 'GIRLS' ? 'purple' : 'blue'}>
                          {student.hostel.hostel_category}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><Badge tone={statusTone(student.student_status)}>{student.student_status || '—'}</Badge></td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" className={btnSecondary} onClick={() => setSelected(student.reg_no)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <StudentDetailModal regNo={selected} onClose={() => setSelected(null)} onUpdated={load} />
    </div>
  );
}

function StudentDetailModal({ regNo, onClose, onUpdated }: { regNo: string | null; onClose: () => void; onUpdated: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState('HOSTELLER');
  const [usesBus, setUsesBus] = useState(false);
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState('');
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!regNo) return;
    setLoading(true);
    setError('');
    try {
      const payload = await api.getStudentDetail(regNo);
      setDetail(payload);
      setCategory(payload.facility?.residence_category || 'HOSTELLER');
      setUsesBus(Boolean(payload.facility?.uses_college_bus));
      setAddress(payload.facility?.day_scholar_address || '');
      setGender(String(payload.student?.gender || ''));
      setVerified(Boolean(payload.facility?.profile_verified));
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [regNo]);

  useEffect(() => {
    if (regNo) {
      setEditing(false);
      void load();
    } else {
      setDetail(null);
    }
  }, [regNo, load]);

  const save = async () => {
    if (!regNo) return;
    setSaving(true);
    setError('');
    try {
      await api.updateStudentFacility(regNo, {
        residence_category: category,
        uses_college_bus: usesBus,
        day_scholar_address: address,
        gender,
        profile_verified: verified,
        reason: 'Updated by hostel administrator',
      });
      setEditing(false);
      await load();
      onUpdated();
    } catch (saveError: any) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(regNo)} title={detail?.student?.name || 'Student'} onClose={onClose} wide>
      {loading ? <Spinner /> : null}
      <ErrorBanner message={error} onRetry={load} />
      {detail && !loading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <KeyValue label="Roll number" value={detail.student?.reg_no} />
            <KeyValue label="Department" value={detail.student?.department?.name} />
            <KeyValue label="Programme" value={detail.student?.programme} />
            <KeyValue label="Semester" value={detail.student?.semester} />
            <KeyValue label="Section" value={detail.student?.section} />
            <KeyValue label="Gender" value={detail.student?.gender || 'Not set'} />
            <KeyValue label="Student status" value={detail.student?.student_status} />
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <SectionTitle title="Facility selection" />
              {!editing ? (
                <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Override
                </button>
              ) : null}
            </div>
            {!editing ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <KeyValue label="Residence" value={detail.facility?.residence_category?.replace(/_/g, ' ') || 'Not selected'} />
                <KeyValue label="College bus" value={detail.facility?.uses_college_bus ? 'Yes' : 'No'} />
                <KeyValue label="Status" value={<Badge tone={statusTone(detail.facility?.status)}>{detail.facility?.status || 'NOT SUBMITTED'}</Badge>} />
                <KeyValue label="Verified" value={detail.facility?.profile_verified ? 'Yes' : 'No'} />
                {detail.facility?.day_scholar_address ? (
                  <div className="sm:col-span-2">
                    <KeyValue label="Day scholar address" value={detail.facility.day_scholar_address} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Residence category" required>
                    <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
                      <option value="HOSTELLER">Hosteller</option>
                      <option value="DAY_SCHOLAR">Day Scholar</option>
                    </select>
                  </Field>
                  <Field label="Gender" required hint="Required for gender-based room allocation.">
                    <select className={inputClass} value={gender} onChange={(event) => setGender(event.target.value)}>
                      <option value="">Select gender</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={usesBus} onChange={(event) => setUsesBus(event.target.checked)} />
                    Uses College Bus
                  </label>
                </div>
                {category === 'DAY_SCHOLAR' ? (
                  <Field label="Residential address">
                    <textarea className={inputClass} rows={2} value={address} onChange={(event) => setAddress(event.target.value)} />
                  </Field>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
                  Mark profile as verified
                </label>
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-3">
              <SectionTitle title="Allocations" />
              <div className="mt-2 space-y-1.5">
                {(detail.allocations || []).length === 0 ? (
                  <p className="text-xs text-gray-500">No allocations.</p>
                ) : (
                  detail.allocations.map((allocation: Allocation) => (
                    <div key={allocation.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-2 text-xs">
                      <span>{allocation.room_label || `${allocation.building_code}/${allocation.room_number}`}</span>
                      <Badge tone={statusTone(allocation.status)}>{allocation.status}</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <SectionTitle title="Fees" />
              <div className="mt-2 space-y-1.5">
                {(detail.fees || []).length === 0 ? (
                  <p className="text-xs text-gray-500">No fee records.</p>
                ) : (
                  detail.fees.map((fee: StudentFee) => (
                    <div key={fee.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-2 text-xs">
                      <span>{fee.fee_structure_name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-gray-500">{formatMoney(fee.amount_due)}</span>
                        <Badge tone={statusTone(fee.status)}>{fee.status}</Badge>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Infrastructure                                                     */
/* ------------------------------------------------------------------ */

function InfrastructureTab({ lookup }: { lookup: Lookup | null }) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingCategoryFilter, setBuildingCategoryFilter] = useState('');
  const [roomCategoryFilter, setRoomCategoryFilter] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buildingModal, setBuildingModal] = useState<{ open: boolean; editing?: Building | null }>({ open: false });
  const [floorModal, setFloorModal] = useState(false);
  const [roomModal, setRoomModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [buildingForm, setBuildingForm] = useState({
    code: '', name: '', building_type: 'HOSTEL', hostel_category: '', campus_location: '', address: '', planned_floors: '1', status: 'ACTIVE', remarks: '',
  });
  const [floorForm, setFloorForm] = useState({ floor_number: '1', name: '', status: 'ACTIVE', is_available_for_allocation: true });
  const [roomForm, setRoomForm] = useState({
    floor: '', room_number: '', room_type: 'DOUBLE', room_purpose: 'HOSTEL', capacity: '2', hostel_category: '', bed_count: '', remarks: '',
  });

  const loadBuildings = useCallback(async () => {
    setError('');
    try {
      const response = await api.getBuildings(
        buildingCategoryFilter ? { hostel_category: buildingCategoryFilter } : {},
      );
      const list = listOf<Building>(response);
      setBuildings(list);
      setSelectedBuildingId((current) =>
        current && list.some((building) => building.id === current) ? current : list[0]?.id || null,
      );
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [buildingCategoryFilter]);

  const loadStructure = useCallback(async (buildingId: number) => {
    try {
      const [floorResponse, roomResponse] = await Promise.all([
        api.getFloors({ building: buildingId }),
        api.getRooms({ building: buildingId }),
      ]);
      setFloors(listOf<Floor>(floorResponse));
      setRooms(listOf<Room>(roomResponse));
    } catch (loadError: any) {
      setError(errorText(loadError));
    }
  }, []);

  useEffect(() => {
    void loadBuildings();
  }, [loadBuildings]);

  useEffect(() => {
    if (selectedBuildingId) void loadStructure(selectedBuildingId);
    else {
      setFloors([]);
      setRooms([]);
    }
  }, [selectedBuildingId, loadStructure]);

  const selectedBuilding = useMemo(
    () => buildings.find((building) => building.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId],
  );

  const visibleRooms = useMemo(() => {
    if (!roomCategoryFilter) return rooms;
    return rooms.filter(
      (room) => (room.effective_hostel_category || room.hostel_category || '') === roomCategoryFilter,
    );
  }, [rooms, roomCategoryFilter]);

  const openBuildingModal = (building?: Building) => {
    setFormError('');
    if (building) {
      setBuildingForm({
        code: building.code,
        name: building.name,
        building_type: building.building_type,
        hostel_category: building.hostel_category || '',
        campus_location: building.campus_location || '',
        address: building.address || '',
        planned_floors: String(building.planned_floors ?? 1),
        status: building.status,
        remarks: building.remarks || '',
      });
    } else {
      setBuildingForm({ code: '', name: '', building_type: 'HOSTEL', hostel_category: '', campus_location: '', address: '', planned_floors: '1', status: 'ACTIVE', remarks: '' });
    }
    setBuildingModal({ open: true, editing: building || null });
  };

  const saveBuilding = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = { ...buildingForm, planned_floors: Number(buildingForm.planned_floors) || 0 };
      if (buildingModal.editing) {
        const updated = await api.updateBuilding(buildingModal.editing.id, payload);
        setBuildings((current) => current.map((building) => (building.id === updated.id ? updated : building)));
      } else {
        const created = await api.createBuilding(payload);
        setBuildings((current) => [...current, created]);
        setSelectedBuildingId(created.id);
      }
      setBuildingModal({ open: false });
    } catch (saveError: any) {
      setFormError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const removeBuilding = async (building: Building) => {
    if (!window.confirm(`Delete building ${building.code}? This also removes its floors and rooms.`)) return;
    try {
      await api.deleteBuilding(building.id);
      setBuildings((current) => current.filter((item) => item.id !== building.id));
      if (selectedBuildingId === building.id) setSelectedBuildingId(null);
    } catch (deleteError: any) {
      setError(errorText(deleteError));
    }
  };

  const saveFloor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBuildingId) return;
    setSaving(true);
    setFormError('');
    try {
      const created = await api.createFloor({
        building: selectedBuildingId,
        floor_number: Number(floorForm.floor_number) || 1,
        name: floorForm.name,
        status: floorForm.status,
        is_available_for_allocation: floorForm.is_available_for_allocation,
      });
      setFloors((current) => [...current, created]);
      setFloorModal(false);
      setFloorForm({ floor_number: String((Number(floorForm.floor_number) || 1) + 1), name: '', status: 'ACTIVE', is_available_for_allocation: true });
    } catch (saveError: any) {
      setFormError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const removeFloor = async (floor: Floor) => {
    if (!window.confirm(`Delete floor ${floor.floor_number}?`)) return;
    try {
      await api.deleteFloor(floor.id);
      setFloors((current) => current.filter((item) => item.id !== floor.id));
    } catch (deleteError: any) {
      setError(errorText(deleteError));
    }
  };

  const saveRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBuildingId) return;
    setSaving(true);
    setFormError('');
    try {
      const created = await api.createRoom({
        building: selectedBuildingId,
        floor: Number(roomForm.floor),
        room_number: roomForm.room_number,
        room_type: roomForm.room_type,
        room_purpose: roomForm.room_purpose,
        capacity: Number(roomForm.capacity) || 0,
        hostel_category: roomForm.hostel_category,
        bed_count: roomForm.bed_count ? Number(roomForm.bed_count) : null,
        facilities: [],
        remarks: roomForm.remarks,
      });
      setRooms((current) => [...current, created]);
      setRoomModal(false);
      setRoomForm({ ...roomForm, room_number: '', bed_count: '', remarks: '' });
    } catch (saveError: any) {
      setFormError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const removeRoom = async (room: Room) => {
    if (!window.confirm(`Delete room ${room.room_number}?`)) return;
    try {
      await api.deleteRoom(room.id);
      setRooms((current) => current.filter((item) => item.id !== room.id));
    } catch (deleteError: any) {
      setError(errorText(deleteError));
    }
  };

  if (loading) return <Spinner label="Loading infrastructure…" />;

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onRetry={loadBuildings} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="p-3">
          <div className="flex items-center justify-between px-1">
            <SectionTitle title="Buildings" subtitle={`${buildings.length} total`} />
            <button type="button" className={btnPrimary} onClick={() => openBuildingModal()}>
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="mt-2 px-1">
            <select
              className={inputClass}
              value={buildingCategoryFilter}
              onChange={(event) => setBuildingCategoryFilter(event.target.value)}
            >
              <option value="">All hostel categories</option>
              <option value="BOYS">Boys hostels</option>
              <option value="GIRLS">Girls hostels</option>
              <option value="MIXED">Mixed hostels</option>
            </select>
          </div>
          <div className="mt-3 space-y-1.5">
            {buildings.length === 0 ? (
              <EmptyState icon={Building2} title="No buildings" message="Add your first hostel building." />
            ) : (
              buildings.map((building) => (
                <button
                  key={building.id}
                  type="button"
                  onClick={() => setSelectedBuildingId(building.id)}
                  className={cx(
                    'w-full rounded-xl border p-2.5 text-left transition',
                    selectedBuildingId === building.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{building.code}</span>
                    <span className="flex items-center gap-1">
                      <Badge tone={building.building_type === 'HOSTEL' ? 'purple' : 'gray'}>{building.building_type}</Badge>
                      {building.hostel_category ? (
                        <Badge tone={building.hostel_category === 'GIRLS' ? 'purple' : building.hostel_category === 'BOYS' ? 'blue' : 'gray'}>
                          {building.hostel_category}
                        </Badge>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-600">{building.name}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {building.actual_floor_count ?? 0} floors · {building.rooms_count ?? 0} rooms · {building.occupied_beds ?? 0}/{building.total_room_capacity ?? 0} beds
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          {selectedBuilding ? (
            <>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{selectedBuilding.name}</h3>
                    <p className="text-xs text-gray-500">
                      {selectedBuilding.code}
                      {selectedBuilding.campus_location ? ` · ${selectedBuilding.campus_location}` : ''}
                      {' · '}planned {selectedBuilding.planned_floors} floor(s), actual {selectedBuilding.actual_floor_count ?? floors.length}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={btnSecondary} onClick={() => openBuildingModal(selectedBuilding)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button type="button" className={btnDanger} onClick={() => removeBuilding(selectedBuilding)}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <SectionTitle
                  title="Floors"
                  subtitle={`${floors.length} configured`}
                  right={<button type="button" className={btnPrimary} onClick={() => { setFormError(''); setFloorModal(true); }}><Plus className="h-4 w-4" /> Add floor</button>}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {floors.length === 0 ? (
                    <div className="sm:col-span-3"><EmptyState icon={Building2} title="No floors yet" /></div>
                  ) : (
                    floors.map((floor) => (
                      <div key={floor.id} className="rounded-xl border border-gray-200 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-900">Floor {floor.floor_number}</span>
                          <div className="flex items-center gap-1">
                            <Badge tone={statusTone(floor.status)}>{floor.status}</Badge>
                            <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => removeFloor(floor)} aria-label="Delete floor">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {floor.rooms_count ?? 0} rooms · {floor.occupied_count ?? 0}/{floor.total_capacity ?? 0} occupied
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <SectionTitle title="Rooms" subtitle={`${visibleRooms.length} of ${rooms.length} shown`} />
                  <div className="flex items-center gap-2">
                    <select
                      className={cx(inputClass, 'w-auto')}
                      value={roomCategoryFilter}
                      onChange={(event) => setRoomCategoryFilter(event.target.value)}
                    >
                      <option value="">All rooms</option>
                      <option value="BOYS">Boys rooms</option>
                      <option value="GIRLS">Girls rooms</option>
                      <option value="MIXED">Mixed rooms</option>
                    </select>
                    <button type="button" className={btnPrimary} onClick={() => { setFormError(''); setRoomForm((current) => ({ ...current, floor: String(floors[0]?.id || '') })); setRoomModal(true); }} disabled={floors.length === 0}>
                      <Plus className="h-4 w-4" /> Add room
                    </button>
                  </div>
                </div>
                {visibleRooms.length === 0 ? (
                  <div className="p-4"><EmptyState icon={DoorOpen} title="No rooms" message="Add floors first, then register rooms." /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <th className="px-3 py-2">Room</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Floor</th>
                          <th className="px-3 py-2">Type / Purpose</th>
                          <th className="px-3 py-2 text-right">Capacity</th>
                          <th className="px-3 py-2 text-right">Occupied</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {visibleRooms.map((room) => (
                          <tr key={room.id} className="hover:bg-gray-50/70">
                            <td className="px-3 py-2.5 font-semibold text-gray-900">{room.room_number}</td>
                            <td className="px-3 py-2.5">
                              {room.effective_hostel_category || room.hostel_category ? (
                                <Badge tone={(room.effective_hostel_category || room.hostel_category) === 'GIRLS' ? 'purple' : 'blue'}>
                                  {room.effective_hostel_category || room.hostel_category}
                                </Badge>
                              ) : (
                                <span className="text-[11px] font-semibold text-amber-600">Not set</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600">{room.floor_number}</td>
                            <td className="px-3 py-2.5 text-gray-600">{room.room_type} · {room.room_purpose}</td>
                            <td className="px-3 py-2.5 text-right text-gray-900">{room.capacity}</td>
                            <td className="px-3 py-2.5 text-right text-gray-900">{room.occupied_count}</td>
                            <td className="px-3 py-2.5"><Badge tone={statusTone(room.status)}>{room.status.replace(/_/g, ' ')}</Badge></td>
                            <td className="px-3 py-2.5 text-right">
                              <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => removeRoom(room)} aria-label="Delete room">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card className="p-6"><EmptyState icon={Building2} title="Select a building" message="Choose a building on the left or create a new one." /></Card>
          )}
        </div>
      </div>

      {/* Building modal */}
      <Modal
        open={buildingModal.open}
        title={buildingModal.editing ? 'Edit building' : 'Add building'}
        onClose={() => setBuildingModal({ open: false })}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setBuildingModal({ open: false })}>Cancel</button>
            <button type="submit" form="hostel-building-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form id="hostel-building-form" className="space-y-3" onSubmit={saveBuilding}>
          {formError ? <ErrorBanner message={formError} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Building code" required><input className={inputClass} value={buildingForm.code} onChange={(event) => setBuildingForm({ ...buildingForm, code: event.target.value })} /></Field>
            <Field label="Building name" required><input className={inputClass} value={buildingForm.name} onChange={(event) => setBuildingForm({ ...buildingForm, name: event.target.value })} /></Field>
            <Field label="Type">
              <select className={inputClass} value={buildingForm.building_type} onChange={(event) => setBuildingForm({ ...buildingForm, building_type: event.target.value })}>
                {['HOSTEL', 'ACADEMIC', 'LABORATORY', 'LIBRARY', 'ADMINISTRATIVE', 'OTHER'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Hostel category" hint="Boys/Girls. Rooms inherit this when their own category is blank.">
              <select className={inputClass} value={buildingForm.hostel_category} onChange={(event) => setBuildingForm({ ...buildingForm, hostel_category: event.target.value })}>
                <option value="">Not specified</option>
                <option value="BOYS">Boys</option>
                <option value="GIRLS">Girls</option>
                <option value="STAFF">Staff</option>
                <option value="MIXED">Mixed</option>
              </select>
            </Field>
            <Field label="Status">
              <select className={inputClass} value={buildingForm.status} onChange={(event) => setBuildingForm({ ...buildingForm, status: event.target.value })}>
                {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Campus location"><input className={inputClass} value={buildingForm.campus_location} onChange={(event) => setBuildingForm({ ...buildingForm, campus_location: event.target.value })} /></Field>
            <Field label="Planned floors" hint="Display only; actual floors come from registered floors.">
              <input type="number" min="0" className={inputClass} value={buildingForm.planned_floors} onChange={(event) => setBuildingForm({ ...buildingForm, planned_floors: event.target.value })} />
            </Field>
          </div>
          <Field label="Address"><textarea className={inputClass} rows={2} value={buildingForm.address} onChange={(event) => setBuildingForm({ ...buildingForm, address: event.target.value })} /></Field>
        </form>
      </Modal>

      {/* Floor modal */}
      <Modal
        open={floorModal}
        title="Add floor"
        onClose={() => setFloorModal(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setFloorModal(false)}>Cancel</button>
            <button type="submit" form="hostel-floor-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form id="hostel-floor-form" className="space-y-3" onSubmit={saveFloor}>
          {formError ? <ErrorBanner message={formError} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Floor number" required>
              <input type="number" min="1" className={inputClass} value={floorForm.floor_number} onChange={(event) => setFloorForm({ ...floorForm, floor_number: event.target.value })} />
            </Field>
            <Field label="Floor name"><input className={inputClass} value={floorForm.name} onChange={(event) => setFloorForm({ ...floorForm, name: event.target.value })} /></Field>
            <Field label="Status">
              <select className={inputClass} value={floorForm.status} onChange={(event) => setFloorForm({ ...floorForm, status: event.target.value })}>
                {['ACTIVE', 'MAINTENANCE', 'INACTIVE'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={floorForm.is_available_for_allocation} onChange={(event) => setFloorForm({ ...floorForm, is_available_for_allocation: event.target.checked })} />
            Available for allocation
          </label>
        </form>
      </Modal>

      {/* Room modal */}
      <Modal
        open={roomModal}
        title="Add room"
        onClose={() => setRoomModal(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setRoomModal(false)}>Cancel</button>
            <button type="submit" form="hostel-room-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form id="hostel-room-form" className="space-y-3" onSubmit={saveRoom}>
          {formError ? <ErrorBanner message={formError} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Floor" required>
              <select className={inputClass} value={roomForm.floor} onChange={(event) => setRoomForm({ ...roomForm, floor: event.target.value })}>
                <option value="">Select floor</option>
                {floors.map((floor) => <option key={floor.id} value={floor.id}>Floor {floor.floor_number}</option>)}
              </select>
            </Field>
            <Field label="Room number" required><input className={inputClass} value={roomForm.room_number} onChange={(event) => setRoomForm({ ...roomForm, room_number: event.target.value })} /></Field>
            <Field label="Room type">
              <select className={inputClass} value={roomForm.room_type} onChange={(event) => setRoomForm({ ...roomForm, room_type: event.target.value })}>
                {(lookup?.room_types || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Purpose">
              <select className={inputClass} value={roomForm.room_purpose} onChange={(event) => setRoomForm({ ...roomForm, room_purpose: event.target.value })}>
                {['HOSTEL', 'ACADEMIC', 'LABORATORY', 'ADMIN', 'OTHER'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Capacity" required><input type="number" min="0" className={inputClass} value={roomForm.capacity} onChange={(event) => setRoomForm({ ...roomForm, capacity: event.target.value })} /></Field>
            <Field label="Bed count"><input type="number" min="0" className={inputClass} value={roomForm.bed_count} onChange={(event) => setRoomForm({ ...roomForm, bed_count: event.target.value })} /></Field>
            <Field label="Hostel category">
              <select className={inputClass} value={roomForm.hostel_category} onChange={(event) => setRoomForm({ ...roomForm, hostel_category: event.target.value })}>
                <option value="">Not specified</option>
                {['BOYS', 'GIRLS', 'STAFF', 'MIXED'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Remarks"><textarea className={inputClass} rows={2} value={roomForm.remarks} onChange={(event) => setRoomForm({ ...roomForm, remarks: event.target.value })} /></Field>
        </form>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Allocations                                                        */
/* ------------------------------------------------------------------ */

function AllocationsTab({ lookup }: { lookup: Lookup | null }) {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [studentQuery, setStudentQuery] = useState('');
  const [studentGenderFilter, setStudentGenderFilter] = useState('');
  const [studentOptions, setStudentOptions] = useState<StudentBrief[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentBrief | null>(null);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [listGender, setListGender] = useState('');
  const [allocationGender, setAllocationGender] = useState('');
  const [form, setForm] = useState({ room: '', start_date: new Date().toISOString().slice(0, 10), expected_end_date: '', remarks: '' });

  // Automatic allocation
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState('');
  const [autoResult, setAutoResult] = useState<{
    requested: number;
    allocated: number;
    skipped: number;
    allocations: Array<{ student: number; reg_no: string; name: string; allocation: Allocation }>;
    errors: Array<{ student?: number; reg_no?: string; reason: string }>;
  } | null>(null);
  const [autoBuilding, setAutoBuilding] = useState('');
  const [autoGender, setAutoGender] = useState('');
  const [autoStartDate, setAutoStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoEndDate, setAutoEndDate] = useState('');
  const [autoRemarks, setAutoRemarks] = useState('Automatic allocation');
  const [autoSearch, setAutoSearch] = useState('');
  const [hostellerStudents, setHostellerStudents] = useState<StudentBrief[]>([]);
  const [autoStudentsLoading, setAutoStudentsLoading] = useState(false);
  const [autoCapacity, setAutoCapacity] = useState<{ boys: number; girls: number; mixed: number } | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  const profileGender = String(selectedStudent?.gender || '').toUpperCase();
  const genderLocked = profileGender === 'MALE' || profileGender === 'FEMALE';

  // Gender-based room selection is compulsory: no gender => no eligible rooms.
  const eligibleRooms = useMemo(() => {
    if (!selectedStudent || !allocationGender) return [];
    return availableRooms.filter((room) => {
      const category = (room.effective_hostel_category || room.hostel_category || '').toUpperCase();
      if (category === 'BOYS') return allocationGender === 'MALE';
      if (category === 'GIRLS') return allocationGender === 'FEMALE';
      return category === 'MIXED';
    });
  }, [availableRooms, selectedStudent, allocationGender]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = includeHistory ? { include_history: 1 } : { status: 'ACTIVE' };
      if (listGender) params.gender = listGender;
      const response = await api.getAllocations(params);
      setAllocations(listOf<Allocation>(response));
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [includeHistory, listGender]);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = async () => {
    setFormOpen(true);
    setFormError('');
    setSelectedStudent(null);
    setStudentOptions([]);
    setStudentQuery('');
    setStudentGenderFilter('');
    setAllocationGender('');
    setForm({ room: '', start_date: new Date().toISOString().slice(0, 10), expected_end_date: '', remarks: '' });
    try {
      const response = await api.getRooms({ available: 'true', hostel_only: 'true' });
      setAvailableRooms(listOf<Room>(response));
    } catch (loadError: any) {
      setFormError(errorText(loadError));
    }
  };

  const searchStudents = async () => {
    try {
      const params: Record<string, unknown> = { q: studentQuery, page_size: 20 };
      if (studentGenderFilter) params.gender = studentGenderFilter;
      const response = await api.getStudents(params);
      setStudentOptions(response.results || []);
    } catch (loadError: any) {
      setFormError(errorText(loadError));
    }
  };

  const eligibleHostellers = useMemo(() => {
    const query = autoSearch.trim().toLowerCase();
    return hostellerStudents.filter((student) => {
      if (student.hostel) return false;
      if (autoGender && String(student.gender || '').toUpperCase() !== autoGender) return false;
      if (!query) return true;
      return `${student.name} ${student.reg_no}`.toLowerCase().includes(query);
    });
  }, [hostellerStudents, autoGender, autoSearch]);

  const openAutoForm = async () => {
    setAutoOpen(true);
    setAutoError('');
    setAutoResult(null);
    setAutoSearch('');
    setAutoBuilding('');
    setAutoGender('');
    setAutoStartDate(new Date().toISOString().slice(0, 10));
    setAutoEndDate('');
    setAutoRemarks('Automatic allocation');
    setSelectedStudentIds([]);
    setAutoStudentsLoading(true);
    try {
      const [studentResponse, roomResponse] = await Promise.all([
        api.getStudents({ residence_category: 'HOSTELLER', page_size: 500 }),
        api.getRooms({ available: 'true', hostel_only: 'true' }),
      ]);
      setHostellerStudents(studentResponse.results || []);
      const rooms = listOf<Room>(roomResponse);
      const capacity = rooms.reduce(
        (totals, room) => {
          const free = Math.max(
            Number(room.available_capacity ?? (Number(room.capacity || 0) - Number(room.occupied_count || 0))),
            0,
          );
          const category = String(room.effective_hostel_category || room.hostel_category || '').toUpperCase();
          if (category === 'BOYS') totals.boys += free;
          else if (category === 'GIRLS') totals.girls += free;
          else if (category === 'MIXED') totals.mixed += free;
          return totals;
        },
        { boys: 0, girls: 0, mixed: 0 },
      );
      setAutoCapacity(capacity);
    } catch (loadError: any) {
      setAutoError(errorText(loadError));
    } finally {
      setAutoStudentsLoading(false);
    }
  };

  const toggleStudentSelection = (studentId: number) => {
    setSelectedStudentIds((current) => (
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    ));
  };

  const runAutoAllocation = async () => {
    if (!selectedStudentIds.length) {
      setAutoError('Select at least one student using the checkboxes.');
      return;
    }
    setAutoLoading(true);
    setAutoError('');
    setAutoResult(null);
    try {
      const response = await api.autoAllocate({
        students: selectedStudentIds,
        building: autoBuilding ? Number(autoBuilding) : null,
        gender: autoGender || '',
        start_date: autoStartDate || null,
        expected_end_date: autoEndDate || null,
        remarks: autoRemarks.trim() || 'Automatic allocation',
      });
      setAutoResult(response);
      setSelectedStudentIds([]);
      await load();
      const refreshed = await api.getStudents({ residence_category: 'HOSTELLER', page_size: 500 });
      setHostellerStudents(refreshed.results || []);
    } catch (allocationError: any) {
      setAutoError(errorText(allocationError));
    } finally {
      setAutoLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent) {
      setFormError('Select a student.');
      return;
    }
    if (!allocationGender) {
      setFormError('Gender selection is compulsory. Choose Boys (Male) or Girls (Female) before allocating a room.');
      return;
    }
    if (genderLocked && profileGender !== allocationGender) {
      setFormError(`This student is recorded as ${profileGender}. Boys rooms are for male students and Girls rooms for female students.`);
      return;
    }
    if (!form.room) {
      setFormError('Select an available room that matches the selected gender.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await api.createAllocation({
        student: selectedStudent.id,
        room: Number(form.room),
        gender: allocationGender,
        start_date: form.start_date,
        expected_end_date: form.expected_end_date || null,
        remarks: form.remarks,
      });
      setFormOpen(false);
      await load();
    } catch (submitError: any) {
      setFormError(errorText(submitError));
    } finally {
      setSaving(false);
    }
  };

  const vacate = async (allocation: Allocation) => {
    const reason = window.prompt('Reason for vacating (optional):') || '';
    if (!window.confirm(`Vacate ${allocation.student_detail?.name || 'student'} from ${allocation.room_label || 'room'}?`)) return;
    try {
      await api.vacateAllocation(allocation.id, { reason });
      await load();
    } catch (vacateError: any) {
      setError(errorText(vacateError));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <SectionTitle title="Room Allocations" subtitle="Capacity and gender matching are enforced by the server" />
        <div className="flex items-center gap-2">
          <select
            className={cx(inputClass, 'w-auto')}
            value={listGender}
            onChange={(event) => setListGender(event.target.value)}
            aria-label="Filter allocations by gender"
          >
            <option value="">All genders</option>
            <option value="MALE">Boys (Male)</option>
            <option value="FEMALE">Girls (Female)</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)} />
            Show history
          </label>
          <button type="button" className={btnSecondary} onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</button>
          <button type="button" className={btnSecondary} onClick={openAutoForm}><Wand2 className="h-4 w-4" /> Auto allocate</button>
          <button type="button" className={btnPrimary} onClick={openForm}><Plus className="h-4 w-4" /> New allocation</button>
        </div>
      </Card>

      <ErrorBanner message={error} onRetry={load} />

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : allocations.length === 0 ? (
          <div className="p-4"><EmptyState icon={BedDouble} title="No allocations" message="Allocate a hostel room to a Hosteller." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Bed</th>
                  <th className="px-3 py-2">Start</th>
                  <th className="px-3 py-2">End</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allocations.map((allocation) => (
                  <tr key={allocation.id} className="hover:bg-gray-50/70">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-gray-900">{allocation.student_detail?.name || `Student #${allocation.student}`}</p>
                      <p className="text-[11px] text-gray-500">{allocation.student_detail?.reg_no}</p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{allocation.building_code ? `${allocation.building_code}/${allocation.room_number}` : allocation.room_label}</td>
                    <td className="px-3 py-2.5 text-gray-600">{allocation.bed_number || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{formatDate(allocation.start_date)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{formatDate(allocation.end_date)}</td>
                    <td className="px-3 py-2.5"><Badge tone={statusTone(allocation.status)}>{allocation.status}</Badge></td>
                    <td className="px-3 py-2.5 text-right">
                      {allocation.status === 'ACTIVE' ? (
                        <button type="button" className={btnDanger} onClick={() => vacate(allocation)}>Vacate</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={formOpen}
        title="New hostel allocation"
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" form="hostel-allocation-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedDouble className="h-4 w-4" />} Allocate
            </button>
          </>
        }
      >
        <form id="hostel-allocation-form" className="space-y-3" onSubmit={submit}>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="rounded-xl border border-gray-200 p-3">
            <SectionTitle title="1. Select student" subtitle={selectedStudent ? `${selectedStudent.name} (${selectedStudent.reg_no})` : 'Search by roll number or name'} />
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className={cx(inputClass, 'min-w-[200px] flex-1')}
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder="Roll number or name"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void searchStudents();
                  }
                }}
              />
              <select
                className={cx(inputClass, 'w-auto')}
                value={studentGenderFilter}
                onChange={(event) => setStudentGenderFilter(event.target.value)}
                aria-label="Filter students by gender"
              >
                <option value="">All students</option>
                <option value="MALE">Boys</option>
                <option value="FEMALE">Girls</option>
              </select>
              <button type="button" className={btnSecondary} onClick={searchStudents}><Search className="h-4 w-4" /> Search</button>
            </div>
            {studentOptions.length ? (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100">
                {studentOptions.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => {
                      const studentGender = String(student.gender || '').toUpperCase();
                      setSelectedStudent(student);
                      setAllocationGender(
                        studentGender === 'MALE' || studentGender === 'FEMALE' ? studentGender : '',
                      );
                      setForm((current) => ({ ...current, room: '' }));
                      setFormError('');
                    }}
                    className={cx(
                      'flex w-full items-center justify-between px-3 py-2 text-left text-xs transition',
                      selectedStudent?.id === student.id ? 'bg-blue-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <span>
                      <span className="font-semibold text-gray-900">{student.name}</span>
                      <span className="ml-2 text-gray-500">{student.reg_no}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Badge tone={student.gender === 'FEMALE' ? 'purple' : student.gender === 'MALE' ? 'blue' : 'gray'}>
                        {student.gender || 'Gender not set'}
                      </Badge>
                      <Badge tone={student.residence_category === 'HOSTELLER' ? 'purple' : 'gray'}>
                        {student.residence_category || 'Not selected'}
                      </Badge>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {selectedStudent && !genderLocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Gender is not set for this student. Select the hostel gender below — it is compulsory and will be saved to the
              student profile for future allocation.
            </div>
          ) : selectedStudent ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              Student profile gender: {profileGender}. Showing {eligibleRooms.length} matching room(s).
              Gender-based allocation is mandatory.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Hostel gender"
              required
              hint="Compulsory — Boys rooms accept male students, Girls rooms accept female students."
            >
              <select
                className={inputClass}
                value={allocationGender}
                onChange={(event) => {
                  setAllocationGender(event.target.value);
                  setForm((current) => ({ ...current, room: '' }));
                }}
                disabled={!selectedStudent || genderLocked}
              >
                <option value="">Select gender</option>
                <option value="MALE">Boys (Male)</option>
                <option value="FEMALE">Girls (Female)</option>
              </select>
            </Field>
            <Field
              label="Room"
              required
              hint={
                selectedStudent && allocationGender
                  ? `${eligibleRooms.length} room(s) matching ${allocationGender === 'MALE' ? 'Boys' : 'Girls'} — gender-based selection is compulsory`
                  : 'Select a student and gender first'
              }
            >
              <select
                className={inputClass}
                value={form.room}
                onChange={(event) => setForm({ ...form, room: event.target.value })}
                disabled={!selectedStudent || !allocationGender || eligibleRooms.length === 0}
              >
                <option value="">Select room</option>
                {eligibleRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.building_code}/{room.room_number} · {room.effective_hostel_category || room.hostel_category || 'Uncategorised'} · {room.available_capacity ?? room.capacity - room.occupied_count}/{room.capacity} free
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date" required>
              <input type="date" className={inputClass} value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
            </Field>
            <Field label="Expected end date">
              <input type="date" className={inputClass} value={form.expected_end_date} onChange={(event) => setForm({ ...form, expected_end_date: event.target.value })} />
            </Field>
            <Field label="Remarks">
              <input className={inputClass} value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} />
            </Field>
          </div>
          <p className="text-[11px] text-gray-500">
            Allocating a room automatically sets the student&apos;s residence category to Hosteller.
          </p>
        </form>
      </Modal>

      <Modal
        open={autoOpen}
        title="Automatic room allocation"
        onClose={() => setAutoOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setAutoOpen(false)}>Close</button>
            <button
              type="button"
              className={btnPrimary}
              onClick={runAutoAllocation}
              disabled={autoLoading || selectedStudentIds.length === 0}
            >
              {autoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Allocate {selectedStudentIds.length || ''} student{selectedStudentIds.length === 1 ? '' : 's'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            Only <strong>Hostellers</strong> without an active allocation are listed. Rooms are matched by
            gender and filled from the lowest-occupancy room first. Day Scholars are never allocated
            hostel facilities. If no vacant bed matches a student, that student is skipped and reported
            in the results.
            {autoCapacity ? (
              <span className="mt-1 block font-semibold">
                Vacant beds now: Boys {autoCapacity.boys}, Girls {autoCapacity.girls}
                {autoCapacity.mixed ? `, Mixed ${autoCapacity.mixed}` : ''}.
              </span>
            ) : null}
          </div>

          {autoError ? <ErrorBanner message={autoError} /> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Hostel block">
              <select className={inputClass} value={autoBuilding} onChange={(event) => setAutoBuilding(event.target.value)}>
                <option value="">All blocks</option>
                {(lookup?.buildings || []).filter((building) => building.is_hostel).map((building) => (
                  <option key={building.id} value={building.id}>{building.code} — {building.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Gender">
              <select className={inputClass} value={autoGender} onChange={(event) => setAutoGender(event.target.value)}>
                <option value="">All genders</option>
                <option value="MALE">Boys (Male)</option>
                <option value="FEMALE">Girls (Female)</option>
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" className={inputClass} value={autoStartDate} onChange={(event) => setAutoStartDate(event.target.value)} />
            </Field>
            <Field label="Expected end date">
              <input type="date" className={inputClass} value={autoEndDate} onChange={(event) => setAutoEndDate(event.target.value)} />
            </Field>
            <Field label="Remarks" className="sm:col-span-2">
              <input className={inputClass} value={autoRemarks} onChange={(event) => setAutoRemarks(event.target.value)} />
            </Field>
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle
                title="Select students"
                subtitle={`${eligibleHostellers.length} Hosteller(s) waiting for a room`}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setSelectedStudentIds(eligibleHostellers.map((student) => student.id))}
                  disabled={eligibleHostellers.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setSelectedStudentIds([])}
                  disabled={selectedStudentIds.length === 0}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                className={cx(inputClass, 'pl-9')}
                value={autoSearch}
                onChange={(event) => setAutoSearch(event.target.value)}
                placeholder="Search by name or registration number"
              />
            </div>

            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
              {autoStudentsLoading ? (
                <Spinner label="Loading Hostellers…" />
              ) : eligibleHostellers.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={Users} title="No Hostellers waiting" message="All eligible Hostellers already have a room." />
                </div>
              ) : (
                eligibleHostellers.map((student) => {
                  const checked = selectedStudentIds.includes(student.id);
                  return (
                    <label
                      key={student.id}
                      className={cx(
                        'flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 text-xs last:border-b-0',
                        checked ? 'bg-blue-50' : 'hover:bg-gray-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        checked={checked}
                        onChange={() => toggleStudentSelection(student.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-gray-900">{student.name}</span>
                        <span className="text-gray-500">
                          {student.reg_no} · {student.department?.short_name || '—'} · Sem {student.semester ?? '—'}
                        </span>
                      </span>
                      <Badge tone={student.gender === 'FEMALE' ? 'purple' : student.gender === 'MALE' ? 'blue' : 'gray'}>
                        {student.gender || 'Gender not set'}
                      </Badge>
                    </label>
                  );
                })
              )}
            </div>
            {selectedStudentIds.length > 0 ? (
              <p className="mt-2 text-xs font-semibold text-blue-700">{selectedStudentIds.length} student(s) selected</p>
            ) : null}
          </div>

          {autoResult ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <p className="font-semibold">
                  Allocated {autoResult.allocated} of {autoResult.requested} student(s).
                  {autoResult.skipped ? ` ${autoResult.skipped} skipped.` : ''}
                </p>
              </div>
              {autoResult.allocations.length ? (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-green-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-green-50 text-left text-[10px] uppercase tracking-wide text-green-800">
                      <tr>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Room</th>
                        <th className="px-3 py-2">Bed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-green-100">
                      {autoResult.allocations.map((row) => (
                        <tr key={row.allocation.id}>
                          <td className="px-3 py-2">
                            <span className="font-semibold text-gray-900">{row.name}</span>
                            <span className="ml-2 text-gray-500">{row.reg_no}</span>
                          </td>
                          <td className="px-3 py-2 font-medium text-green-800">
                            {row.allocation.building_code ? `${row.allocation.building_code}/` : ''}
                            {row.allocation.room_number || row.allocation.room_label}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{row.allocation.bed_number || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {autoResult.errors.length ? (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-semibold">Skipped students</p>
                  <ul className="mt-1 space-y-0.5">
                    {autoResult.errors.map((row, index) => (
                      <li key={index}>• {row.reg_no || `Student #${row.student}`}: {row.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Approvals                                                          */
/* ------------------------------------------------------------------ */

function ApprovalsTab() {
  const [requests, setRequests] = useState<FacilityChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getFacilityRequests({ status: 'PENDING' });
      setRequests(listOf<FacilityChangeRequest>(response));
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (request: FacilityChangeRequest, approve: boolean) => {
    const remarks = window.prompt(approve ? 'Approval remarks (optional):' : 'Rejection reason:') || '';
    setBusyId(request.id);
    try {
      await api.decideFacilityRequest(request.id, approve, remarks);
      await load();
    } catch (decisionError: any) {
      setError(errorText(decisionError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <SectionTitle title="Facility change requests" subtitle="First-time selections or category changes awaiting approval" />
        <button type="button" className={btnSecondary} onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</button>
      </Card>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <Spinner />
      ) : requests.length === 0 ? (
        <Card className="p-4"><EmptyState icon={ClipboardList} title="No pending requests" message="All facility selections have been reviewed." /></Card>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <Card key={request.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {request.student_detail?.name || `Student #${request.student}`}
                    {request.student_detail?.reg_no ? <span className="ml-2 text-xs font-normal text-gray-500">{request.student_detail.reg_no}</span> : null}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    {request.previous_category || 'Not selected'} → <strong>{request.requested_category.replace(/_/g, ' ')}</strong>
                    {' · '}College Bus: {request.requested_uses_college_bus ? 'Yes' : 'No'}
                  </p>
                  {request.reason ? <p className="mt-1 text-xs text-gray-500">Reason: {request.reason}</p> : null}
                  {request.day_scholar_address ? <p className="mt-1 text-xs text-gray-500">Address: {request.day_scholar_address}</p> : null}
                  <p className="mt-1 text-[11px] text-gray-400">Requested {formatDateTime(request.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} disabled={busyId === request.id} onClick={() => decide(request, true)}>
                    {busyId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve
                  </button>
                  <button type="button" className={btnDanger} disabled={busyId === request.id} onClick={() => decide(request, false)}>
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Complaints                                                         */
/* ------------------------------------------------------------------ */

function ComplaintsTab() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getComplaints(statusFilter ? { status: statusFilter } : {});
      setComplaints(listOf<Complaint>(response));
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (complaint: Complaint, statusValue: string) => {
    const note = window.prompt('Note for this status change (optional):') || '';
    setBusyId(complaint.id);
    try {
      await api.updateComplaintStatus(complaint.id, { status: statusValue, note });
      await load();
    } catch (updateError: any) {
      setError(errorText(updateError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
        <SectionTitle title="Complaints & Maintenance" subtitle="Assign staff and move tickets through the workflow" />
        <div className="flex items-end gap-2">
          <Field label="Status">
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              {['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>
          <button type="button" className={btnSecondary} onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
      </Card>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <Spinner />
      ) : complaints.length === 0 ? (
        <Card className="p-4"><EmptyState icon={Wrench} title="No complaints" /></Card>
      ) : (
        <div className="space-y-2">
          {complaints.map((complaint) => (
            <Card key={complaint.id} className="p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-gray-500">{complaint.ticket_no}</span>
                    <p className="text-sm font-semibold text-gray-900">{complaint.subject}</p>
                    <Badge tone={complaint.priority === 'URGENT' ? 'red' : complaint.priority === 'HIGH' ? 'amber' : 'gray'}>{complaint.priority}</Badge>
                    <Badge tone={statusTone(complaint.status)}>{complaint.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{complaint.description}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {complaint.student_detail?.name} ({complaint.student_detail?.reg_no})
                    {complaint.building_name ? ` · ${complaint.building_name}` : ''}
                    {complaint.room_number ? ` · Room ${complaint.room_number}` : ''}
                    {' · '}{formatDateTime(complaint.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={btnSecondary}
                      disabled={busyId === complaint.id || complaint.status === value}
                      onClick={() => updateStatus(complaint, value)}
                    >
                      {busyId === complaint.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {value.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fees                                                               */
/* ------------------------------------------------------------------ */

function FeesTab({ lookup }: { lookup: Lookup | null }) {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [fees, setFees] = useState<StudentFee[]>([]);
  const [feeSearch, setFeeSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [structureModal, setStructureModal] = useState(false);
  const [paymentFee, setPaymentFee] = useState<StudentFee | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [structureForm, setStructureForm] = useState({ name: '', fee_type: 'HOSTEL', amount: '', due_date: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'CASH', paid_on: new Date().toISOString().slice(0, 10), reference_no: '', remarks: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [structureResponse, feeResponse] = await Promise.all([
        api.getFeeStructures(),
        api.getStudentFees({ q: feeSearch, page_size: 100 }),
      ]);
      setStructures(listOf<FeeStructure>(structureResponse));
      setFees(feeResponse.results || []);
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [feeSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveStructure = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api.createFeeStructure({
        name: structureForm.name,
        fee_type: structureForm.fee_type,
        amount: structureForm.amount || 0,
        due_date: structureForm.due_date || null,
        is_active: true,
      });
      setStructureModal(false);
      setStructureForm({ name: '', fee_type: 'HOSTEL', amount: '', due_date: '' });
      await load();
    } catch (saveError: any) {
      setFormError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const savePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentFee) return;
    setSaving(true);
    setFormError('');
    try {
      await api.recordPayment({
        student_fee: paymentFee.id,
        amount: paymentForm.amount,
        method: paymentForm.method,
        paid_on: paymentForm.paid_on,
        reference_no: paymentForm.reference_no,
        remarks: paymentForm.remarks,
      });
      setPaymentFee(null);
      setPaymentForm({ amount: '', method: 'CASH', paid_on: new Date().toISOString().slice(0, 10), reference_no: '', remarks: '' });
      await load();
    } catch (saveError: any) {
      setFormError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px]">
            <Field label="Search student fees">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input className={cx(inputClass, 'pl-9')} value={feeSearch} onChange={(event) => setFeeSearch(event.target.value)} placeholder="Roll number or name" />
              </div>
            </Field>
          </div>
          <button type="button" className={btnSecondary} onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnPrimary} onClick={() => { setFormError(''); setStructureModal(true); }}>
            <Plus className="h-4 w-4" /> Fee structure
          </button>
        </div>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      <Card className="p-4">
        <SectionTitle title="Fee structures" subtitle={`${structures.length} configured`} />
        <div className="mt-3 flex flex-wrap gap-2">
          {structures.length === 0 ? (
            <p className="text-xs text-gray-500">No fee structures yet.</p>
          ) : (
            structures.map((structure) => (
              <div key={structure.id} className="rounded-xl border border-gray-200 px-3 py-2 text-xs">
                <p className="font-semibold text-gray-900">{structure.name}</p>
                <p className="text-gray-500">{structure.fee_type} · {formatMoney(structure.amount)}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <SectionTitle title="Student fee obligations" subtitle="Record payments and track outstanding balances" />
        </div>
        {loading ? (
          <Spinner />
        ) : fees.length === 0 ? (
          <div className="p-4"><EmptyState icon={Wallet} title="No fee records" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Fee</th>
                  <th className="px-3 py-2">Due date</th>
                  <th className="px-3 py-2 text-right">Due</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fees.map((fee) => (
                  <tr key={fee.id} className="hover:bg-gray-50/70">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-gray-900">{fee.student_detail?.name}</p>
                      <p className="text-[11px] text-gray-500">{fee.student_detail?.reg_no}</p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{fee.fee_structure_name}</td>
                    <td className="px-3 py-2.5 text-gray-600">{formatDate(fee.due_date)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-900">{formatMoney(fee.amount_due)}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-700">{formatMoney(fee.amount_paid)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-red-600">{formatMoney(fee.balance)}</td>
                    <td className="px-3 py-2.5"><Badge tone={statusTone(fee.status)}>{fee.status}</Badge></td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" className={btnSecondary} onClick={() => { setFormError(''); setPaymentFee(fee); }}>
                        <Wallet className="h-3.5 w-3.5" /> Pay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={structureModal}
        title="New fee structure"
        onClose={() => setStructureModal(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setStructureModal(false)}>Cancel</button>
            <button type="submit" form="hostel-fee-structure-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form id="hostel-fee-structure-form" className="space-y-3" onSubmit={saveStructure}>
          {formError ? <ErrorBanner message={formError} /> : null}
          <Field label="Name" required><input className={inputClass} value={structureForm.name} onChange={(event) => setStructureForm({ ...structureForm, name: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fee type">
              <select className={inputClass} value={structureForm.fee_type} onChange={(event) => setStructureForm({ ...structureForm, fee_type: event.target.value })}>
                {(lookup?.fee_types || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Amount" required><input type="number" min="0" step="0.01" className={inputClass} value={structureForm.amount} onChange={(event) => setStructureForm({ ...structureForm, amount: event.target.value })} /></Field>
            <Field label="Due date"><input type="date" className={inputClass} value={structureForm.due_date} onChange={(event) => setStructureForm({ ...structureForm, due_date: event.target.value })} /></Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(paymentFee)}
        title="Record fee payment"
        onClose={() => setPaymentFee(null)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setPaymentFee(null)}>Cancel</button>
            <button type="submit" form="hostel-payment-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Record
            </button>
          </>
        }
      >
        <form id="hostel-payment-form" className="space-y-3" onSubmit={savePayment}>
          {formError ? <ErrorBanner message={formError} /> : null}
          {paymentFee ? (
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              <p className="font-semibold">{paymentFee.student_detail?.name} · {paymentFee.fee_structure_name}</p>
              <p className="mt-1">Balance: {formatMoney(paymentFee.balance)}</p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" required><input type="number" min="0.01" step="0.01" className={inputClass} value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></Field>
            <Field label="Method">
              <select className={inputClass} value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
                {['CASH', 'UPI', 'CARD', 'NEFT', 'CHEQUE', 'OTHER'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Paid on"><input type="date" className={inputClass} value={paymentForm.paid_on} onChange={(event) => setPaymentForm({ ...paymentForm, paid_on: event.target.value })} /></Field>
            <Field label="Reference number"><input className={inputClass} value={paymentForm.reference_no} onChange={(event) => setPaymentForm({ ...paymentForm, reference_no: event.target.value })} /></Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notices                                                            */
/* ------------------------------------------------------------------ */

function NoticesTab({ lookup }: { lookup: Lookup | null }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    title: '',
    body: '',
    notice_type: 'GENERAL',
    audience: 'ALL',
    building: '',
    is_emergency: false,
    is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getNotices();
      setNotices(listOf<Notice>(response));
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api.createNotice({
        ...form,
        building: form.building ? Number(form.building) : null,
        published_at: new Date().toISOString(),
      });
      setFormOpen(false);
      setForm({ title: '', body: '', notice_type: 'GENERAL', audience: 'ALL', building: '', is_emergency: false, is_active: true });
      await load();
    } catch (submitError: any) {
      setFormError(errorText(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <SectionTitle title="Hostel Notices" subtitle="Fee reminders, allocation updates, transport notices and emergencies" />
        <div className="flex gap-2">
          <button type="button" className={btnSecondary} onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</button>
          <button type="button" className={btnPrimary} onClick={() => { setFormError(''); setFormOpen(true); }}><Plus className="h-4 w-4" /> New notice</button>
        </div>
      </Card>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <Spinner />
      ) : notices.length === 0 ? (
        <Card className="p-4"><EmptyState icon={CalendarDays} title="No notices published" /></Card>
      ) : (
        <div className="space-y-2">
          {notices.map((notice) => (
            <Card key={notice.id} className="p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{notice.title}</p>
                  <Badge tone="blue">{notice.notice_type.replace(/_/g, ' ')}</Badge>
                  <Badge tone="gray">{notice.audience.replace(/_/g, ' ')}</Badge>
                  {notice.is_emergency ? <Badge tone="red">Emergency</Badge> : null}
                  {!notice.is_active ? <Badge tone="gray">Inactive</Badge> : null}
                </div>
                <span className="text-[11px] text-gray-500">{formatDateTime(notice.published_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-xs text-gray-700">{notice.body}</p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        title="Publish hostel notice"
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" form="hostel-notice-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Publish
            </button>
          </>
        }
      >
        <form id="hostel-notice-form" className="space-y-3" onSubmit={submit}>
          {formError ? <ErrorBanner message={formError} /> : null}
          <Field label="Title" required><input className={inputClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <select className={inputClass} value={form.notice_type} onChange={(event) => setForm({ ...form, notice_type: event.target.value })}>
                {['GENERAL', 'FEE', 'COMPLAINT', 'ALLOCATION', 'TRANSPORT', 'EMERGENCY'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Audience">
              <select className={inputClass} value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })}>
                {['ALL', 'HOSTELLERS', 'DAY_SCHOLARS', 'BUS_USERS', 'BUILDING'].map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            {form.audience === 'BUILDING' ? (
              <Field label="Building">
                <select className={inputClass} value={form.building} onChange={(event) => setForm({ ...form, building: event.target.value })}>
                  <option value="">Select building</option>
                  {(lookup?.buildings || []).map((building) => <option key={building.id} value={building.id}>{building.code} · {building.name}</option>)}
                </select>
              </Field>
            ) : null}
          </div>
          <Field label="Message" required><textarea className={inputClass} rows={5} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={form.is_emergency} onChange={(event) => setForm({ ...form, is_emergency: event.target.checked })} />
            Emergency announcement
          </label>
        </form>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

function SettingsTab({ lookup }: { lookup: Lookup | null }) {
  const [config, setConfig] = useState<HostelConfig | null>(null);
  const [windows, setWindows] = useState<SelectionWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [windowModal, setWindowModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [windowForm, setWindowForm] = useState({
    title: '',
    academic_year: '',
    opens_at: '',
    closes_at: '',
    allow_self_selection: true,
    require_approval: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [configResponse, windowResponse] = await Promise.all([api.getHostelConfig(), api.getSelectionWindows()]);
      setConfig(configResponse);
      setWindows(listOf<SelectionWindow>(windowResponse));
    } catch (loadError: any) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: keyof HostelConfig) => {
    if (!config) return;
    setConfig({ ...config, [key]: !config[key] });
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateHostelConfig(config);
      setConfig(updated);
    } catch (saveError: any) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveWindow = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!windowForm.opens_at || !windowForm.closes_at) {
      setFormError('Provide both the opening and closing date/time.');
      return;
    }
    const opensAt = new Date(windowForm.opens_at);
    const closesAt = new Date(windowForm.closes_at);
    if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
      setFormError('Provide valid opening and closing date/time values.');
      return;
    }
    if (closesAt <= opensAt) {
      setFormError('Closing time must be after opening time.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await api.createSelectionWindow({
        title: windowForm.title,
        academic_year: windowForm.academic_year ? Number(windowForm.academic_year) : null,
        opens_at: opensAt.toISOString(),
        closes_at: closesAt.toISOString(),
        is_active: true,
        allow_self_selection: windowForm.allow_self_selection,
        require_approval: windowForm.require_approval,
      });
      setWindowModal(false);
      setWindowForm({ title: '', academic_year: '', opens_at: '', closes_at: '', allow_self_selection: true, require_approval: false });
      await load();
    } catch (saveError: any) {
      setFormError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Loading settings…" />;

  const toggles: Array<{ key: keyof HostelConfig; label: string; hint: string }> = [
    { key: 'allow_student_self_selection', label: 'Students can select their facilities', hint: 'When disabled, submissions become approval requests.' },
    { key: 'require_approval_for_selection', label: 'Approve first-time selections', hint: 'Every first-time category selection needs administrator approval.' },
    { key: 'allow_student_edit_after_selection', label: 'Students can edit their selection', hint: 'When disabled, changes are submitted as approval requests.' },
    { key: 'require_approval_for_changes', label: 'Approve category changes', hint: 'Category changes always go through the approval workflow.' },
    { key: 'release_room_on_category_change', label: 'Release room when switching to Day Scholar', hint: 'Keep disabled to require the vacating/transfer workflow.' },
    { key: 'profile_verification_required', label: 'Require profile verification', hint: 'Selections stay unverified until staff confirm them.' },
  ];

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onRetry={load} />

      <Card className="p-4 sm:p-5">
        <SectionTitle
          title="Hostel policy"
          subtitle="Controls how students select facilities and how changes are approved"
          right={
            <button type="button" className={btnPrimary} onClick={saveConfig} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save policy
            </button>
          }
        />
        <div className="mt-4 space-y-2">
          {toggles.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-gray-200 p-3">
              <span>
                <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{item.hint}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(config?.[item.key])}
                onClick={() => toggle(item.key)}
                className={cx(
                  'relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition',
                  config?.[item.key] ? 'bg-blue-600' : 'bg-gray-300',
                )}
              >
                <span
                  className={cx(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition',
                    config?.[item.key] ? 'left-[22px]' : 'left-0.5',
                  )}
                />
              </button>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle
          title="Facility selection windows"
          subtitle="Students can make a first-time selection only inside an open window"
          right={<button type="button" className={btnPrimary} onClick={() => { setFormError(''); setWindowModal(true); }}><Plus className="h-4 w-4" /> Add window</button>}
        />
        <div className="mt-3 space-y-2">
          {windows.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No windows configured" message="Without a window, selection is open all the time (policy permitting)." />
          ) : (
            windows.map((window) => (
              <div key={window.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-2.5 text-xs">
                <div>
                  <p className="font-semibold text-gray-900">{window.title || 'Selection window'}</p>
                  <p className="text-gray-500">
                    {formatDateTime(window.opens_at)} – {formatDateTime(window.closes_at)}
                    {window.academic_year_name ? ` · ${window.academic_year_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={window.is_open_now ? 'green' : window.is_active ? 'amber' : 'gray'}>
                    {window.is_open_now ? 'Open' : window.is_active ? 'Scheduled' : 'Inactive'}
                  </Badge>
                  {window.require_approval ? <Badge tone="purple">Approval</Badge> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Modal
        open={windowModal}
        title="Add selection window"
        onClose={() => setWindowModal(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setWindowModal(false)}>Cancel</button>
            <button type="submit" form="hostel-window-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form id="hostel-window-form" className="space-y-3" onSubmit={saveWindow}>
          {formError ? <ErrorBanner message={formError} /> : null}
          <Field label="Title"><input className={inputClass} value={windowForm.title} onChange={(event) => setWindowForm({ ...windowForm, title: event.target.value })} placeholder="Semester start selection" /></Field>
          <Field label="Academic year">
            <select className={inputClass} value={windowForm.academic_year} onChange={(event) => setWindowForm({ ...windowForm, academic_year: event.target.value })}>
              <option value="">Any</option>
              {(lookup?.academic_years || []).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Opens at" required><input type="datetime-local" className={inputClass} value={windowForm.opens_at} onChange={(event) => setWindowForm({ ...windowForm, opens_at: event.target.value })} /></Field>
            <Field label="Closes at" required><input type="datetime-local" className={inputClass} value={windowForm.closes_at} onChange={(event) => setWindowForm({ ...windowForm, closes_at: event.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={windowForm.allow_self_selection} onChange={(event) => setWindowForm({ ...windowForm, allow_self_selection: event.target.checked })} />
            Allow self selection
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={windowForm.require_approval} onChange={(event) => setWindowForm({ ...windowForm, require_approval: event.target.checked })} />
            Require administrator approval
          </label>
        </form>
      </Modal>
    </div>
  );
}
