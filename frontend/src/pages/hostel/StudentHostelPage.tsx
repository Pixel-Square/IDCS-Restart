import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  Bell,
  Building2,
  Bus,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Home,
  Info,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Star,
  User,
  Utensils,
  Wallet,
  Wrench,
} from 'lucide-react';
import * as api from '../../services/hostel';
import {
  Allocation,
  Complaint,
  LeaveRequest,
  MessMenu,
  MyFacilityResponse,
  Notice,
  StudentFee,
  TransportAssignment,
  VacatingRequest,
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
  btnPrimary,
  btnSecondary,
  cx,
  formatDate,
  formatDateTime,
  formatMoney,
  inputClass,
  statusTone,
} from './HostelUI';

type TabKey = 'overview' | 'fees' | 'complaints' | 'mess' | 'leave' | 'notices' | 'transport' | 'vacating';

const todayIso = () => new Date().toISOString().slice(0, 10);

const CATEGORY_LABEL: Record<string, string> = {
  DAY_SCHOLAR: 'Day Scholar',
  HOSTELLER: 'Hosteller',
  '': 'Not selected',
};

export default function StudentHostelPage() {
  const [data, setData] = useState<MyFacilityResponse | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('overview');
  const [formOpen, setFormOpen] = useState(false);

  // Selection form
  const [category, setCategory] = useState('DAY_SCHOLAR');
  const [usesBus, setUsesBus] = useState(false);
  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [gender, setGender] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Tab data
  const [fees, setFees] = useState<Array<StudentFee & { payments?: api.FeePayment[] }>>([]);
  const [feeSummary, setFeeSummary] = useState<any>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [menus, setMenus] = useState<MessMenu[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [transport, setTransport] = useState<{ active: TransportAssignment | null; history: TransportAssignment[] } | null>(null);
  const [vacating, setVacating] = useState<VacatingRequest[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState('');

  const applyFacilityToForm = useCallback((payload: MyFacilityResponse | null) => {
    const facility = payload?.facility;
    setCategory(facility?.residence_category || 'DAY_SCHOLAR');
    setUsesBus(Boolean(facility?.uses_college_bus));
    setAddress(facility?.day_scholar_address || '');
    setEmergencyName(facility?.emergency_contact_name || '');
    setEmergencyPhone(facility?.emergency_contact_phone || '');
    setGender(String(payload?.student?.gender || ''));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await api.getMyFacility();
      setData(payload);
      applyFacilityToForm(payload);
      if (payload.access?.page_access) {
        try {
          setOverview(await api.getMyOverview());
        } catch (overviewError: any) {
          console.warn('Hostel overview failed:', overviewError?.message);
        }
      } else {
        setOverview(null);
      }
      try {
        setTransport(await api.getMyTransport());
      } catch {
        setTransport(null);
      }
      setFormOpen(false);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load the hostel portal.');
    } finally {
      setLoading(false);
    }
  }, [applyFacilityToForm]);

  useEffect(() => {
    void load();
  }, [load]);

  const isHosteller = Boolean(data?.access?.is_hosteller);
  const pageAccess = Boolean(data?.access?.page_access);
  const hasSelection = Boolean(data?.access?.has_selection);
  const selectionState = data?.selection_state;
  const canEditDirectly =
    !hasSelection || data?.policy?.allow_student_edit_after_selection === true;

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [];
    if (isHosteller) {
      tabs.push({ key: 'overview', label: 'Overview', icon: Home });
      tabs.push({ key: 'fees', label: 'Fees', icon: Wallet });
      tabs.push({ key: 'complaints', label: 'Complaints', icon: Wrench });
      tabs.push({ key: 'mess', label: 'Mess', icon: Utensils });
      tabs.push({ key: 'leave', label: 'Leave', icon: CalendarDays });
      tabs.push({ key: 'vacating', label: 'Vacating', icon: LogOut });
    }
    tabs.push({ key: 'notices', label: 'Notices', icon: Bell });
    tabs.push({ key: 'transport', label: 'Transport', icon: Bus });
    return tabs;
  }, [isHosteller]);

  useEffect(() => {
    if (!visibleTabs.some((item) => item.key === tab)) {
      setTab(visibleTabs[0]?.key || 'notices');
    }
  }, [visibleTabs, tab]);

  const loadTab = useCallback(
    async (key: TabKey) => {
      setTabError('');
      setTabLoading(true);
      try {
        if (key === 'fees') {
          const response = await api.getMyFees();
          setFees(response.results || []);
          setFeeSummary((response as any).summary || null);
        } else if (key === 'complaints') {
          const response = await api.getMyComplaints();
          setComplaints(response.results || []);
        } else if (key === 'mess') {
          setMenus(await api.getMyMessMenu(7));
        } else if (key === 'leave') {
          const response = await api.getMyLeaves();
          setLeaves(response.results || []);
        } else if (key === 'notices') {
          const response = await api.getMyNotices();
          setNotices(response.results || []);
        } else if (key === 'transport') {
          setTransport(await api.getMyTransport());
        } else if (key === 'vacating') {
          const response = await api.getMyVacating();
          setVacating(response.results || []);
        }
      } catch (loadError: any) {
        setTabError(loadError?.message || 'Unable to load this section.');
      } finally {
        setTabLoading(false);
      }
    },
    [],
  );

  const loadedTabsRef = React.useRef<Set<TabKey>>(new Set());
  useEffect(() => {
    if (!pageAccess && tab !== 'notices' && tab !== 'transport') return;
    if (loadedTabsRef.current.has(tab)) return;
    loadedTabsRef.current.add(tab);
    void loadTab(tab);
  }, [tab, pageAccess, loadTab]);

  const refreshAll = async () => {
    loadedTabsRef.current.clear();
    await load();
    void loadTab(tab);
  };

  const submitSelection = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!gender) {
      setFormError('Please select your gender. It is required for hostel allocation.');
      return;
    }
    if (category === 'DAY_SCHOLAR' && !address.trim()) {
      setFormError('Please enter your residential address as a Day Scholar.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.submitMyFacility({
        residence_category: category,
        uses_college_bus: usesBus,
        day_scholar_address: address.trim(),
        emergency_contact_name: emergencyName.trim(),
        emergency_contact_phone: emergencyPhone.trim(),
        gender,
        reason: reason.trim(),
      });
      setSuccessMessage(response.message || 'Saved.');
      loadedTabsRef.current.clear();
      await load();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (submitError: any) {
      setFormError(submitError?.message || 'Unable to save your selection.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <Spinner label="Loading hostel portal…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-800 p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
              Hostel &amp; Student Facilities
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{data?.student?.name || 'Student Portal'}</h1>
            <p className="mt-1 text-sm text-blue-100">
              {data?.student?.reg_no}
              {data?.student?.department?.short_name ? ` · ${data.student.department.short_name}` : ''}
              {data?.student?.semester ? ` · Semester ${data.student.semester}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isHosteller ? 'green' : 'amber'} className="border-white/20 bg-white/10 text-white">
              {CATEGORY_LABEL[data?.facility?.residence_category || ''] || 'Not selected'}
            </Badge>
            {data?.facility?.uses_college_bus ? (
              <Badge tone="blue" className="border-white/20 bg-white/10 text-white">
                College Bus
              </Badge>
            ) : null}
            <button type="button" onClick={refreshAll} className={cx(btnSecondary, 'border-white/30 bg-white/10 text-white hover:bg-white/20')}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
      </header>

      <ErrorBanner message={error} onRetry={load} />
      {successMessage ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> {successMessage}
        </div>
      ) : null}

      {/* Student category and facilities */}
      <Card className="p-4 sm:p-5">
        <SectionTitle
          title="Student Category and Facilities"
          subtitle="Choose your residence category and, independently, whether you use the college bus."
          right={
            !formOpen ? (
              <button type="button" className={btnPrimary} onClick={() => setFormOpen(true)}>
                {hasSelection ? 'Change selection' : 'Choose facilities'}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : null
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Residence category</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
              {isHosteller ? <BedDouble className="h-4 w-4 text-blue-600" /> : <Home className="h-4 w-4 text-emerald-600" />}
              {CATEGORY_LABEL[data?.facility?.residence_category || ''] || 'Not selected'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {isHosteller
                ? 'You are eligible for hostel room allocation.'
                : hasSelection
                  ? 'You commute from your residence.'
                  : 'Make a selection to unlock your facilities.'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Transportation facility</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Bus className={cx('h-4 w-4', data?.facility?.uses_college_bus ? 'text-blue-600' : 'text-gray-400')} />
              College Bus: {data?.facility?.uses_college_bus ? 'Yes' : 'No'}
            </p>
            <p className="mt-1 text-xs text-gray-500">A Day Scholar can also use the College Bus.</p>
          </div>
        </div>

        <div
          className={cx(
            'mt-4 flex flex-wrap items-center gap-2 rounded-xl border p-3 text-xs',
            selectionState?.open
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          <Info className="h-4 w-4" />
          <span className="font-semibold">{selectionState?.message || 'Facility selection status unavailable.'}</span>
          {selectionState?.opens_at && selectionState?.closes_at ? (
            <span className="text-[11px] opacity-80">
              (Window: {formatDateTime(selectionState.opens_at)} – {formatDateTime(selectionState.closes_at)})
            </span>
          ) : null}
        </div>

        {data?.facility?.status === 'PENDING' ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Clock className="h-4 w-4" />
            Your selection is awaiting administrator approval.
          </div>
        ) : null}

        {data?.facility?.status === 'REJECTED' && data?.facility?.review_remarks ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>
              Your selection was rejected: {data.facility.review_remarks}
            </span>
          </div>
        ) : null}

        {!canEditDirectly && hasSelection ? (
          <p className="mt-3 text-xs text-gray-500">
            Changing an existing selection creates an approval request for the hostel administrator.
          </p>
        ) : null}
      </Card>

      {/* Hostel portal locked */}
      {!pageAccess ? (
        <Card className="p-5">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Hostel portal is not available</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {data?.access?.reason || 'Select Hosteller as your residence category to access the hostel portal.'}
              </p>
            </div>
            <button type="button" className={btnPrimary} onClick={() => setFormOpen(true)}>
              Select Hosteller
            </button>
          </div>
        </Card>
      ) : null}

      {/* Hosteller dashboard */}
      {pageAccess ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={Building2}
              label="Room"
              value={
                overview?.allocation
                  ? `${overview.allocation.building_code || overview.allocation.building_name || 'Hostel'} · ${overview.allocation.room_number}`
                  : 'Not allocated'
              }
              hint={
                overview?.allocation
                  ? `Floor ${overview.allocation.floor_number ?? '—'}${overview.allocation.bed_number ? ` · Bed ${overview.allocation.bed_number}` : ''}`
                  : 'Awaiting hostel allocation'
              }
              tone="blue"
            />
            <SummaryCard
              icon={Wallet}
              label="Outstanding fees"
              value={formatMoney(overview?.fees_summary?.outstanding ?? feeSummary?.outstanding ?? 0)}
              hint={`Paid: ${formatMoney(overview?.fees_summary?.total_paid ?? feeSummary?.total_paid ?? 0)}`}
              tone="amber"
            />
            <SummaryCard
              icon={Wrench}
              label="Open complaints"
              value={overview?.open_complaints ?? complaints.filter((item) => !['RESOLVED', 'CLOSED', 'REJECTED'].includes(item.status)).length}
              hint="Maintenance requests in progress"
              tone="purple"
            />
            <SummaryCard
              icon={Bell}
              label="Notices"
              value={overview?.notices?.length ?? notices.length}
              hint={`${notices.filter((notice) => !notice.is_read).length} unread`}
              tone="green"
            />
          </div>

          <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            {visibleTabs.map((item) => (
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

          <ErrorBanner message={tabError} onRetry={() => loadTab(tab)} />

          {tabLoading ? <Spinner /> : null}

          {!tabLoading && tab === 'overview' ? (
            <OverviewTab
              allocation={overview?.allocation || data?.allocation}
              facility={data?.facility}
              student={data?.student}
              notices={(overview?.notices || []).slice(0, 5)}
              onOpenTab={setTab}
            />
          ) : null}

          {!tabLoading && tab === 'fees' ? <FeesTab fees={fees} summary={feeSummary} /> : null}

          {!tabLoading && tab === 'complaints' ? (
            <ComplaintsTab
              complaints={complaints}
              onCreated={async () => {
                await loadTab('complaints');
                try {
                  setOverview(await api.getMyOverview());
                } catch {
                  /* ignore */
                }
              }}
            />
          ) : null}

          {!tabLoading && tab === 'mess' ? <MessTab menus={menus} /> : null}

          {!tabLoading && tab === 'leave' ? (
            <LeaveTab leaves={leaves} onCreated={() => loadTab('leave')} />
          ) : null}

          {!tabLoading && tab === 'notices' ? (
            <NoticesTab
              notices={notices}
              onRead={async (noticeId) => {
                await api.markNoticeRead(noticeId);
                setNotices((current) => current.map((notice) => (notice.id === noticeId ? { ...notice, is_read: true } : notice)));
              }}
            />
          ) : null}

          {!tabLoading && tab === 'transport' ? <TransportTab transport={transport} /> : null}

          {!tabLoading && tab === 'vacating' ? (
            <VacatingTab
              requests={vacating}
              allocation={overview?.allocation || data?.allocation}
              onCreated={() => loadTab('vacating')}
            />
          ) : null}
        </>
      ) : null}

      {/* Non-hosteller transport view */}
      {!pageAccess && transport ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle title="College Bus" subtitle="Your transport assignment" />
          <div className="mt-3">
            <TransportTab transport={transport} compact />
          </div>
        </Card>
      ) : null}

      <Modal
        open={formOpen}
        title="Student Category and Facilities"
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="hostel-facility-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save selection'}
            </button>
          </>
        }
      >
        <form id="hostel-facility-form" className="space-y-4" onSubmit={submitSelection}>
          {formError ? <ErrorBanner message={formError} /> : null}
          {!selectionState?.open && !hasSelection ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {selectionState?.message || 'Facility selection is currently closed.'}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCategory('DAY_SCHOLAR')}
              className={cx(
                'rounded-xl border p-4 text-left transition',
                category === 'DAY_SCHOLAR'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100'
                  : 'border-gray-200 bg-white hover:border-gray-300',
              )}
            >
              <Home className={cx('h-5 w-5', category === 'DAY_SCHOLAR' ? 'text-emerald-600' : 'text-gray-400')} />
              <p className="mt-2 text-sm font-semibold text-gray-900">Day Scholar</p>
              <p className="mt-1 text-xs text-gray-500">I will commute from my own residence.</p>
            </button>
            <button
              type="button"
              onClick={() => setCategory('HOSTELLER')}
              className={cx(
                'rounded-xl border p-4 text-left transition',
                category === 'HOSTELLER'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                  : 'border-gray-200 bg-white hover:border-gray-300',
              )}
            >
              <BedDouble className={cx('h-5 w-5', category === 'HOSTELLER' ? 'text-blue-600' : 'text-gray-400')} />
              <p className="mt-2 text-sm font-semibold text-gray-900">Hosteller</p>
              <p className="mt-1 text-xs text-gray-500">I need a hostel room on campus.</p>
            </button>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
              checked={usesBus}
              onChange={(event) => setUsesBus(event.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <Bus className="h-4 w-4 text-blue-600" /> College Bus
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Enable this even if you are a Day Scholar.
              </span>
            </span>
          </label>

          <Field label="Gender" required hint="Required — hostel rooms are allocated by gender (Boys / Girls).">
            <select className={inputClass} value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="">Select gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>

          {category === 'DAY_SCHOLAR' ? (
            <Field label="Residential address" required hint="Required for Day Scholars.">
              <textarea
                className={inputClass}
                rows={3}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="House / street / area / city"
              />
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Emergency contact name">
              <input
                className={inputClass}
                value={emergencyName}
                onChange={(event) => setEmergencyName(event.target.value)}
                placeholder="Parent / guardian"
              />
            </Field>
            <Field label="Emergency contact phone">
              <input
                className={inputClass}
                value={emergencyPhone}
                onChange={(event) => setEmergencyPhone(event.target.value)}
                placeholder="+91…"
              />
            </Field>
          </div>

          {hasSelection ? (
            <Field label="Reason for change" hint="Shown to the approving administrator.">
              <input
                className={inputClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Optional"
              />
            </Field>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small summary card                                                 */
/* ------------------------------------------------------------------ */

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
        </div>
        <span className={cx('rounded-xl p-2', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                           */
/* ------------------------------------------------------------------ */

function OverviewTab({
  allocation,
  facility,
  student,
  notices,
  onOpenTab,
}: {
  allocation?: Allocation | null;
  facility?: api.Facility | null;
  student?: api.StudentBrief;
  notices: Notice[];
  onOpenTab: (tab: TabKey) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 sm:p-5 lg:col-span-2">
        <SectionTitle title="My Room" subtitle="Current hostel allocation" />
        {allocation ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <KeyValue label="Building" value={allocation.building_name || allocation.building_code} />
            <KeyValue label="Room" value={allocation.room_number || allocation.room_label} />
            <KeyValue label="Floor" value={allocation.floor_number} />
            <KeyValue label="Bed" value={allocation.bed_number || 'Not assigned'} />
            <KeyValue label="Allocated on" value={formatDate(allocation.start_date)} />
            <KeyValue label="Expected vacate" value={formatDate(allocation.expected_end_date)} />
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={BedDouble}
              title="No active room allocation"
              message="The hostel office will allocate a room after your Hosteller selection is approved."
            />
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" className={cx(btnSecondary, 'justify-start')} onClick={() => onOpenTab('complaints')}>
            <Wrench className="h-4 w-4" /> Raise a complaint
          </button>
          <button type="button" className={cx(btnSecondary, 'justify-start')} onClick={() => onOpenTab('leave')}>
            <CalendarDays className="h-4 w-4" /> Request leave
          </button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <SectionTitle title="Student details" />
          <div className="mt-3 space-y-3">
            <KeyValue label="Name" value={student?.name} />
            <KeyValue label="Roll number" value={student?.reg_no} />
            <KeyValue label="Department" value={student?.department?.name} />
            <KeyValue label="Programme" value={student?.programme} />
            <KeyValue label="Section" value={student?.section} />
            <KeyValue label="Gender" value={student?.gender || 'Not set'} />
            <KeyValue label="Residence" value={CATEGORY_LABEL[facility?.residence_category || '']} />
          </div>
          {facility?.profile_verified ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Profile verified by the hostel office
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
              <Clock className="h-4 w-4" /> Profile verification pending
            </div>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle title="Latest notices" right={<button type="button" className={btnSecondary} onClick={() => onOpenTab('notices')}>View all</button>} />
          <div className="mt-3 space-y-2">
            {notices.length === 0 ? (
              <EmptyState icon={Bell} title="No notices yet" />
            ) : (
              notices.map((notice) => (
                <div key={notice.id} className="rounded-lg border border-gray-100 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{notice.title}</p>
                    {notice.is_emergency ? <Badge tone="red">Emergency</Badge> : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{notice.body}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fees                                                               */
/* ------------------------------------------------------------------ */

function FeesTab({ fees, summary }: { fees: StudentFee[]; summary: any }) {
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        title="Hostel, Mess and Transport Fees"
        subtitle="Amounts calculated from your active fee obligations"
        right={
          summary ? (
            <div className="flex gap-3 text-xs">
              <span className="text-gray-500">Due: <strong className="text-gray-900">{formatMoney(summary.total_due)}</strong></span>
              <span className="text-gray-500">Paid: <strong className="text-emerald-700">{formatMoney(summary.total_paid)}</strong></span>
              <span className="text-gray-500">Outstanding: <strong className="text-red-600">{formatMoney(summary.outstanding)}</strong></span>
            </div>
          ) : null
        }
      />
      <div className="mt-4 overflow-x-auto">
        {fees.length === 0 ? (
          <EmptyState icon={Receipt} title="No fee records" message="Fee obligations will appear once the hostel office publishes them." />
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2">Fee</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Due date</th>
                <th className="px-2 py-2 text-right">Due</th>
                <th className="px-2 py-2 text-right">Paid</th>
                <th className="px-2 py-2 text-right">Balance</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fees.map((fee) => (
                <tr key={fee.id}>
                  <td className="px-2 py-2.5">
                    <p className="font-semibold text-gray-900">{fee.fee_structure_name}</p>
                    {fee.payments?.length ? (
                      <p className="text-[11px] text-gray-500">
                        {fee.payments.length} payment{fee.payments.length > 1 ? 's' : ''} · last {formatDate(fee.payments[0]?.paid_on)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5 text-gray-600">{fee.fee_type}</td>
                  <td className="px-2 py-2.5 text-gray-600">{formatDate(fee.due_date)}</td>
                  <td className="px-2 py-2.5 text-right text-gray-900">{formatMoney(fee.amount_due)}</td>
                  <td className="px-2 py-2.5 text-right text-emerald-700">{formatMoney(fee.amount_paid)}</td>
                  <td className="px-2 py-2.5 text-right font-semibold text-red-600">{formatMoney(fee.balance)}</td>
                  <td className="px-2 py-2.5">
                    <Badge tone={statusTone(fee.status)}>{fee.status.replace(/_/g, ' ')}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Complaints                                                         */
/* ------------------------------------------------------------------ */

const COMPLAINT_CATEGORIES = ['ELECTRICAL', 'PLUMBING', 'INTERNET', 'FURNITURE', 'HOUSEKEEPING', 'OTHER'];
const COMPLAINT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function ComplaintsTab({ complaints, onCreated }: { complaints: Complaint[]; onCreated: () => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState('ELECTRICAL');
  const [priority, setPriority] = useState('MEDIUM');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!subject.trim()) {
      setError('Please enter a subject.');
      return;
    }
    setSaving(true);
    try {
      await api.createMyComplaint({ category, priority, subject: subject.trim(), description: description.trim() });
      setFormOpen(false);
      setSubject('');
      setDescription('');
      onCreated();
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to submit the complaint.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        title="Complaints & Maintenance"
        subtitle="Report electrical, plumbing, internet, furniture or housekeeping issues"
        right={
          <button type="button" className={btnPrimary} onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> New complaint
          </button>
        }
      />
      <div className="mt-4 space-y-2">
        {complaints.length === 0 ? (
          <EmptyState icon={Wrench} title="No complaints submitted" />
        ) : (
          complaints.map((complaint) => (
            <div key={complaint.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-gray-500">{complaint.ticket_no}</span>
                  <p className="text-sm font-semibold text-gray-900">{complaint.subject}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={complaint.priority === 'URGENT' ? 'red' : complaint.priority === 'HIGH' ? 'amber' : 'gray'}>
                    {complaint.priority}
                  </Badge>
                  <Badge tone={statusTone(complaint.status)}>{complaint.status.replace(/_/g, ' ')}</Badge>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-600">{complaint.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                <span>{complaint.category}</span>
                <span>Raised {formatDateTime(complaint.created_at)}</span>
                {complaint.room_number ? <span>Room {complaint.room_number}</span> : null}
                {complaint.assigned_to_name ? <span>Assigned to {complaint.assigned_to_name}</span> : null}
              </div>
              {complaint.resolution_notes ? (
                <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
                  Resolution: {complaint.resolution_notes}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>

      <Modal
        open={formOpen}
        title="New complaint"
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" form="student-complaint-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
            </button>
          </>
        }
      >
        <form id="student-complaint-form" className="space-y-3" onSubmit={submit}>
          {error ? <ErrorBanner message={error} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" required>
              <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
                {COMPLAINT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority" required>
              <select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value)}>
                {COMPLAINT_PRIORITIES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Subject" required>
            <input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
          <Field label="Description">
            <textarea className={inputClass} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </form>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Mess                                                               */
/* ------------------------------------------------------------------ */

function MessTab({ menus }: { menus: MessMenu[] }) {
  const [date, setDate] = useState(todayIso());
  const [mealType, setMealType] = useState('LUNCH');
  const [rating, setRating] = useState(4);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.submitMessFeedback({ date, meal_type: mealType, rating, comments: comments.trim() });
      setMessage('Thanks! Your mess feedback was recorded.');
      setComments('');
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to save feedback.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 sm:p-5 lg:col-span-2">
        <SectionTitle title="Mess Menu" subtitle="Published menu for the next 7 days" />
        <div className="mt-3 space-y-2">
          {menus.length === 0 ? (
            <EmptyState icon={Utensils} title="No menu published yet" />
          ) : (
            menus.map((menu) => (
              <div key={menu.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{formatDate(menu.date)}</p>
                  <Badge tone="blue">{menu.meal_type}</Badge>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-gray-600">{menu.items}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle title="Meal feedback" subtitle="Rate today's meal" />
        <form className="mt-3 space-y-3" onSubmit={submit}>
          {error ? <ErrorBanner message={error} /> : null}
          {message ? (
            <div className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">{message}</div>
          ) : null}
          <Field label="Date">
            <input type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Meal">
            <select className={inputClass} value={mealType} onChange={(event) => setMealType(event.target.value)}>
              {['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Rating">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className={cx(
                    'rounded-lg p-1.5 transition',
                    value <= rating ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300',
                  )}
                  aria-label={`${value} star`}
                >
                  <Star className="h-5 w-5 fill-current" />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Comments">
            <textarea className={inputClass} rows={3} value={comments} onChange={(event) => setComments(event.target.value)} />
          </Field>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit feedback
          </button>
        </form>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leave                                                              */
/* ------------------------------------------------------------------ */

function LeaveTab({ leaves, onCreated }: { leaves: LeaveRequest[]; onCreated: () => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [leaveType, setLeaveType] = useState('HOME');
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('');
  const [guardianContact, setGuardianContact] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('Please provide a reason for your leave.');
      return;
    }
    setSaving(true);
    try {
      await api.createMyLeave({
        leave_type: leaveType,
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim(),
        destination: destination.trim(),
        guardian_contact: guardianContact.trim(),
      });
      setFormOpen(false);
      setReason('');
      onCreated();
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to submit the leave request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        title="Leave & Movement"
        subtitle="Request permission to leave the hostel"
        right={<button type="button" className={btnPrimary} onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New leave request</button>}
      />
      <div className="mt-4 space-y-2">
        {leaves.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No leave requests" />
        ) : (
          leaves.map((leave) => (
            <div key={leave.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  {leave.leave_type} · {formatDate(leave.from_date)} → {formatDate(leave.to_date)}
                </p>
                <Badge tone={statusTone(leave.status)}>{leave.status.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="mt-1 text-xs text-gray-600">{leave.reason}</p>
              {leave.destination ? <p className="mt-1 text-[11px] text-gray-500">Destination: {leave.destination}</p> : null}
            </div>
          ))
        )}
      </div>

      <Modal
        open={formOpen}
        title="New leave request"
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" form="student-leave-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
            </button>
          </>
        }
      >
        <form id="student-leave-form" className="space-y-3" onSubmit={submit}>
          {error ? <ErrorBanner message={error} /> : null}
          <Field label="Leave type" required>
            <select className={inputClass} value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>
              <option value="HOME">Home visit</option>
              <option value="MEDICAL">Medical</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" required>
              <input type="date" className={inputClass} value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </Field>
            <Field label="To" required>
              <input type="date" className={inputClass} value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </Field>
          </div>
          <Field label="Reason" required>
            <textarea className={inputClass} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Destination">
              <input className={inputClass} value={destination} onChange={(event) => setDestination(event.target.value)} />
            </Field>
            <Field label="Guardian contact">
              <input className={inputClass} value={guardianContact} onChange={(event) => setGuardianContact(event.target.value)} />
            </Field>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Notices                                                            */
/* ------------------------------------------------------------------ */

function NoticesTab({ notices, onRead }: { notices: Notice[]; onRead: (id: number) => Promise<void> }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle title="Hostel Notices" subtitle="Allocation, fee, mess and emergency announcements" />
      <div className="mt-4 space-y-2">
        {notices.length === 0 ? (
          <EmptyState icon={Bell} title="No notices" />
        ) : (
          notices.map((notice) => (
            <div
              key={notice.id}
              className={cx(
                'rounded-xl border p-3',
                notice.is_read ? 'border-gray-200 bg-white' : 'border-blue-200 bg-blue-50/50',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{notice.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {notice.notice_type.replace(/_/g, ' ')} · {formatDateTime(notice.published_at)}
                    {notice.created_by_name ? ` · ${notice.created_by_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {notice.is_emergency ? <Badge tone="red">Emergency</Badge> : null}
                  {notice.is_read ? (
                    <Badge tone="green">Read</Badge>
                  ) : (
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={busyId === notice.id}
                      onClick={async () => {
                        setBusyId(notice.id);
                        try {
                          await onRead(notice.id);
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      {busyId === notice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Mark read
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-xs text-gray-700">{notice.body}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Transport                                                          */
/* ------------------------------------------------------------------ */

function TransportTab({ transport, compact = false }: { transport: { active: TransportAssignment | null; history: TransportAssignment[] }; compact?: boolean }) {
  if (!transport.active && (transport.history || []).length === 0) {
    return <EmptyState icon={Bus} title="No bus assignment" message="The transport coordinator has not assigned a route yet." />;
  }
  const active = transport.active;
  return (
    <div className={compact ? '' : 'grid gap-4 lg:grid-cols-2'}>
      <Card className={compact ? '' : 'p-4 sm:p-5'}>
        <SectionTitle title="Active bus assignment" />
        {active ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <KeyValue label="Route" value={`${active.route_code || ''} ${active.route_name || ''}`.trim()} />
            <KeyValue label="Bus number" value={active.bus_number} />
            <KeyValue label="Board at" value={active.stop_name_display || active.boarding_point} />
            <KeyValue label="Transport fee" value={formatMoney(active.fee_amount)} />
            <KeyValue label="Status" value={<Badge tone={statusTone(active.status)}>{active.status}</Badge>} />
            <KeyValue label="Assigned on" value={formatDate(active.assigned_at)} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-500">No active assignment.</p>
        )}
      </Card>

      {!compact ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle title="Assignment history" />
          <div className="mt-3 space-y-2">
            {(transport.history || []).length === 0 ? (
              <EmptyState icon={Bus} title="No history" />
            ) : (
              transport.history.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-2 text-xs">
                  <span className="font-medium text-gray-800">
                    {item.route_code} · {item.bus_number || 'No bus'}
                  </span>
                  <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vacating                                                           */
/* ------------------------------------------------------------------ */

function VacatingTab({
  requests,
  allocation,
  onCreated,
}: {
  requests: VacatingRequest[];
  allocation?: Allocation | null;
  onCreated: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [vacateDate, setVacateDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.createVacatingRequest({ requested_vacate_date: vacateDate, reason: reason.trim() });
      setFormOpen(false);
      setReason('');
      onCreated();
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to submit the vacating request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        title="Vacating & Clearance"
        subtitle="Room, asset and fee clearance must be completed before final approval"
        right={
          allocation ? (
            <button type="button" className={btnPrimary} onClick={() => setFormOpen(true)}>
              <LogOut className="h-4 w-4" /> Request vacating
            </button>
          ) : null
        }
      />
      <div className="mt-4 space-y-2">
        {requests.length === 0 ? (
          <EmptyState icon={LogOut} title="No vacating requests" message={allocation ? 'You can raise a vacating request for your current room.' : 'A vacating request requires an active room allocation.'} />
        ) : (
          requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  Vacate {request.room_label || 'room'} · {formatDate(request.requested_vacate_date)}
                </p>
                <Badge tone={statusTone(request.status)}>{request.status.replace(/_/g, ' ')}</Badge>
              </div>
              {request.reason ? <p className="mt-1 text-xs text-gray-600">{request.reason}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <Badge tone={request.room_verified ? 'green' : 'gray'}>Room {request.room_verified ? 'verified' : 'pending'}</Badge>
                <Badge tone={request.assets_verified ? 'green' : 'gray'}>Assets {request.assets_verified ? 'verified' : 'pending'}</Badge>
                <Badge tone={request.dues_cleared ? 'green' : 'gray'}>Dues {request.dues_cleared ? 'cleared' : 'pending'}</Badge>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={formOpen}
        title="Request room vacating"
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" form="student-vacating-form" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit request
            </button>
          </>
        }
      >
        <form id="student-vacating-form" className="space-y-3" onSubmit={submit}>
          {error ? <ErrorBanner message={error} /> : null}
          <Field label="Requested vacate date" required>
            <input type="date" className={inputClass} value={vacateDate} onChange={(event) => setVacateDate(event.target.value)} />
          </Field>
          <Field label="Reason">
            <textarea className={inputClass} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600">
            Clearance steps: room verification → asset verification → fee/mess dues → final approval.
          </div>
        </form>
      </Modal>
    </Card>
  );
}
