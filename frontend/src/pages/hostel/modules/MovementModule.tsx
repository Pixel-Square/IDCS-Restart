import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  Plus,
  QrCode,
  ScanLine,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import * as api from '../../../services/hostelOps';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
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
  inputClass,
} from '../HostelUI';

const PASS_TYPES = [
  { key: 'LOCAL_OUTING', label: 'Local Outing' },
  { key: 'HOME_LEAVE', label: 'Home Leave' },
  { key: 'EMERGENCY', label: 'Emergency' },
  { key: 'NIGHT_OUT', label: 'Night Out' },
];

const passTone = (row: api.GatePass) => {
  if (row.is_late_entry) return 'red';
  if (row.status === 'APPROVED') return 'green';
  if (row.status === 'PENDING') return 'amber';
  if (row.status === 'COMPLETED') return 'blue';
  if (row.status === 'REJECTED' || row.status === 'CANCELLED' || row.status === 'EXPIRED') return 'red';
  return 'gray';
};

const localInput = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type MovementProps = {
  isStudent: boolean;
  canApprove: boolean;
  canOperateGate: boolean;
};

export default function MovementModule({ isStudent, canApprove, canOperateGate }: MovementProps) {
  const tabs = useMemo(() => {
    const rows: Array<{ key: string; label: string }> = [];
    if (isStudent) rows.push({ key: 'student', label: 'My passes' });
    if (canApprove) rows.push({ key: 'warden', label: 'Warden approvals' });
    if (canOperateGate) rows.push({ key: 'security', label: 'Security gate' });
    return rows;
  }, [isStudent, canApprove, canOperateGate]);

  const [tab, setTab] = useState(tabs[0]?.key || 'student');

  useEffect(() => {
    if (!tabs.some((row) => row.key === tab) && tabs.length) setTab(tabs[0].key);
  }, [tabs, tab]);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Student movement hub"
        subtitle="Gate pass requests, warden approvals and security verification in one place."
      />
      {tabs.length > 1 ? (
        <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-1">
          {tabs.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => setTab(row.key)}
              className={cx(
                'rounded-md px-3 py-1.5 text-sm font-semibold transition',
                tab === row.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800',
              )}
            >
              {row.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'student' ? <StudentMovement /> : null}
      {tab === 'warden' ? <WardenApprovals /> : null}
      {tab === 'security' ? <SecurityGate /> : null}
    </div>
  );
}

function StudentMovement() {
  const [data, setData] = useState<api.GatePass[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({
    pass_type: 'LOCAL_OUTING',
    from_date: now.toISOString().slice(0, 10),
    to_date: now.toISOString().slice(0, 10),
    expected_out_time: localInput(now),
    expected_in_time: localInput(new Date(now.getTime() + 2 * 60 * 60 * 1000)),
    reason: '',
    destination: '',
    guardian_contact: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getMyGatePasses();
      setData(response.results || []);
      setSummary(response.summary);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load gate passes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.createGatePass({
        pass_type: form.pass_type as any,
        from_date: form.from_date,
        to_date: form.to_date,
        expected_out_time: form.expected_out_time,
        expected_in_time: form.expected_in_time,
        reason: form.reason,
        destination: form.destination,
        guardian_contact: form.guardian_contact,
      });
      setModalOpen(false);
      setForm({ ...form, reason: '', destination: '' });
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not submit the gate pass.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id: number) => {
    if (!window.confirm('Cancel this gate pass?')) return;
    setSaving(true);
    try {
      await api.cancelGatePass(id);
      await load();
    } catch (cancelError: any) {
      setError(cancelError?.message || 'Could not cancel the pass.');
    } finally {
      setSaving(false);
    }
  };

  const active = data.filter((row) => row.status === 'APPROVED' && !row.is_expired);

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} onRetry={load} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active passes" value={summary?.active ?? 0} hint="Approved and usable" icon={QrCode} tone="green" />
        <StatCard label="Awaiting approval" value={summary?.pending ?? 0} hint="With the warden" icon={Clock} tone="amber" />
        <StatCard label="Late returns" value={summary?.late_entries ?? 0} hint="Flagged by security" icon={AlertTriangle} tone="red" />
      </div>

      <div className="flex justify-end">
        <button type="button" className={btnPrimary} onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Request gate pass
        </button>
      </div>

      {loading ? (
        <Spinner label="Loading passes…" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {active.length === 0 ? (
              <Card className="p-4 lg:col-span-2">
                <EmptyState icon={QrCode} title="No active pass" message="Submit a request to receive a digital pass with QR code." />
              </Card>
            ) : (
              active.map((row) => (
                <Card key={row.id} className="overflow-hidden">
                  <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white p-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                        {row.pass_type_display || row.pass_type}
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-gray-900">{row.destination || 'Local outing'}</p>
                      <p className="text-xs text-gray-500">{row.student_detail?.reg_no}</p>
                    </div>
                    <Badge tone={passTone(row)}>{row.status_display || row.status}</Badge>
                  </div>
                  <div className="flex flex-col gap-4 p-4 sm:flex-row">
                    {row.qr_image ? (
                      <img src={row.qr_image} alt="Gate pass QR" className="h-32 w-32 rounded-lg border border-gray-200 bg-white p-1" />
                    ) : (
                      <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400">
                        <QrCode className="h-10 w-10" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1 text-sm">
                      <p className="text-xs text-gray-500">Token</p>
                      <p className="font-mono text-xs font-semibold text-gray-800">{row.qr_token}</p>
                      <p className="pt-2 text-xs text-gray-500">Out</p>
                      <p className="font-medium text-gray-800">{formatDateTime(row.expected_out_time)}</p>
                      <p className="text-xs text-gray-500">Expected return</p>
                      <p className="font-medium text-gray-800">{formatDateTime(row.expected_in_time)}</p>
                      <p className="pt-1 text-xs text-gray-500">{row.reason}</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-2">
                    <button type="button" className={btnDanger} onClick={() => cancel(row.id)} disabled={saving}>
                      Cancel pass
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>

          <Card className="p-4">
            <SectionTitle title="Pass history" subtitle={`${data.length} request(s)`} />
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Out</th>
                    <th className="px-3 py-2">In</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-medium text-gray-800">{row.pass_type_display || row.pass_type}</td>
                      <td className="px-3 py-2 text-gray-600">{formatDate(row.from_date)}</td>
                      <td className="px-3 py-2 text-gray-600">{formatDate(row.to_date)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={passTone(row)}>{row.status_display || row.status}</Badge>
                          {row.is_late_entry ? <Badge tone="red">Late</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{row.warden_remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">No passes yet.</p> : null}
            </div>
          </Card>
        </>
      )}

      <Modal
        open={modalOpen}
        title="Request a gate pass"
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={submit} disabled={saving || !form.reason.trim()}>
              {saving ? 'Submitting…' : 'Submit request'}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pass type" required>
            <select className={inputClass} value={form.pass_type} onChange={(event) => setForm({ ...form, pass_type: event.target.value })}>
              {PASS_TYPES.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
            </select>
          </Field>
          <Field label="Destination">
            <input className={inputClass} value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} placeholder="City / home address" />
          </Field>
          <Field label="From date" required>
            <input type="date" className={inputClass} value={form.from_date} onChange={(event) => setForm({ ...form, from_date: event.target.value })} />
          </Field>
          <Field label="To date" required>
            <input type="date" className={inputClass} value={form.to_date} onChange={(event) => setForm({ ...form, to_date: event.target.value })} />
          </Field>
          <Field label="Expected out" required>
            <input type="datetime-local" className={inputClass} value={form.expected_out_time} onChange={(event) => setForm({ ...form, expected_out_time: event.target.value })} />
          </Field>
          <Field label="Expected return" required>
            <input type="datetime-local" className={inputClass} value={form.expected_in_time} onChange={(event) => setForm({ ...form, expected_in_time: event.target.value })} />
          </Field>
          <Field label="Guardian contact">
            <input className={inputClass} value={form.guardian_contact} onChange={(event) => setForm({ ...form, guardian_contact: event.target.value })} placeholder="Phone number" />
          </Field>
          <Field label="Reason" required className="sm:col-span-2">
            <textarea className={cx(inputClass, 'min-h-[84px]')} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Purpose of the outing / leave" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function WardenApprovals() {
  const [data, setData] = useState<api.GatePass[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<api.GatePass | null>(null);
  const [remarks, setRemarks] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getGatePasses({ status: status || undefined });
      setData(response.results || []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load approval queue.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (row: api.GatePass, approve: boolean) => {
    setSaving(true);
    setError('');
    try {
      await api.decideGatePass(row.id, approve, remarks);
      setSelected(null);
      setRemarks('');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save the decision.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onRetry={load} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          {['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', ''].map((value) => (
            <button
              key={value || 'ALL'}
              type="button"
              onClick={() => setStatus(value)}
              className={cx('rounded-md px-3 py-1.5 text-xs font-semibold', status === value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600')}
            >
              {value || 'All'}
            </button>
          ))}
        </div>
        <button type="button" className={btnSecondary} onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <Spinner label="Loading requests…" />
      ) : data.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={CheckCircle2} title="Nothing to review" message="Pending gate pass requests will appear here." />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900">{row.student_detail?.name || row.student_detail?.reg_no}</p>
                    <Badge tone={passTone(row)}>{row.status_display || row.status}</Badge>
                    {row.is_late_entry ? <Badge tone="red">Late entry</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {row.pass_type_display || row.pass_type} · {formatDate(row.from_date)} → {formatDate(row.to_date)}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">{row.reason}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Out: {formatDateTime(row.expected_out_time)} · Return: {formatDateTime(row.expected_in_time)}
                  </p>
                </div>
                {row.status === 'PENDING' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => { setSelected(row); setRemarks(''); }}
                      disabled={saving}
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => decide(row, true)} disabled={saving}>
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">{row.warden_remarks || '—'}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        title="Reject gate pass"
        onClose={() => setSelected(null)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setSelected(null)}>Cancel</button>
            <button type="button" className={btnDanger} onClick={() => selected && decide(selected, false)} disabled={saving}>
              Reject request
            </button>
          </>
        }
      >
        <Field label="Warden remarks" required>
          <textarea className={cx(inputClass, 'min-h-[96px]')} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Reason for rejection" />
        </Field>
      </Modal>
    </div>
  );
}

function SecurityGate() {
  const [token, setToken] = useState('');
  const [result, setResult] = useState<api.GatePass | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    if (!token.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await api.scanGatePass(token.trim());
      setResult(response.pass);
      setMessage(response.valid ? 'Pass is valid at the gate.' : 'Pass found but it is not currently usable.');
    } catch (scanError: any) {
      setResult(null);
      setError(scanError?.message || 'No pass found for this token.');
    } finally {
      setBusy(false);
    }
  };

  const record = async (direction: 'exit' | 'entry') => {
    if (!token.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = direction === 'exit'
        ? await api.verifyGateExit(token.trim())
        : await api.verifyGateEntry(token.trim());
      setResult(response.pass);
      setMessage('detail' in response ? String(response.detail) : 'Recorded.');
    } catch (gateError: any) {
      setError(gateError?.message || 'Could not record gate movement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2">
        <SectionTitle title="Gate verification" subtitle="Scan the pass QR or type the token / roll number." />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              className={cx(inputClass, 'pl-9')}
              placeholder="GP-20261017-XXXXXXXXXX or roll number"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void lookup(); }}
            />
          </div>
          <button type="button" className={btnPrimary} onClick={lookup} disabled={busy}>
            <ShieldCheck className="h-4 w-4" /> Verify
          </button>
        </div>

        <ErrorBanner message={error} />
        {message ? (
          <p className="mt-3 rounded-lg bg-blue-50 p-2 text-sm font-semibold text-blue-700">{message}</p>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-gray-900">{result.student_detail?.name || result.student_detail?.reg_no}</p>
                <p className="text-xs text-gray-500">{result.student_detail?.reg_no}</p>
                <p className="mt-1 text-sm text-gray-700">{result.pass_type_display || result.pass_type} · {result.reason}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Out: {formatDateTime(result.expected_out_time)} · Return: {formatDateTime(result.expected_in_time)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={passTone(result)}>{result.status_display || result.status}</Badge>
                {result.is_late_entry ? <Badge tone="red">Late entry</Badge> : null}
                {result.is_expired ? <Badge tone="red">Expired</Badge> : null}
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Actual out</p>
                <p className="text-xs font-semibold text-gray-800">{formatDateTime(result.actual_out_time)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Actual in</p>
                <p className="text-xs font-semibold text-gray-800">{formatDateTime(result.actual_in_time)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Token</p>
                <p className="truncate font-mono text-[11px] font-semibold text-gray-800">{result.qr_token}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} onClick={() => record('exit')} disabled={busy || Boolean(result.actual_out_time)}>
                <LogOut className="h-4 w-4" /> Record exit
              </button>
              <button type="button" className={btnPrimary} onClick={() => record('entry')} disabled={busy || !result.actual_out_time || Boolean(result.actual_in_time)}>
                <LogIn className="h-4 w-4" /> Record entry
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <SectionTitle title="How it works" subtitle="Late returns are auto-flagged." />
        <ol className="mt-3 space-y-3 text-sm text-gray-600">
          <li className="flex gap-2"><span className="font-bold text-blue-600">1.</span> Verify the pass before the student leaves.</li>
          <li className="flex gap-2"><span className="font-bold text-blue-600">2.</span> Record the exit.</li>
          <li className="flex gap-2"><span className="font-bold text-blue-600">3.</span> On return, verify again and record entry.</li>
          <li className="flex gap-2"><span className="font-bold text-blue-600">4.</span> Returns after the expected time are flagged as late automatically.</li>
        </ol>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Red badge = expired or late</p>
        </div>
      </Card>
    </div>
  );
}
