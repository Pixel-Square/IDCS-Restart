import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
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
  btnPrimary,
  btnSecondary,
  cx,
  formatDateTime,
  inputClass,
} from '../HostelUI';

type VisitorForm = {
  student: string;
  visitor_name: string;
  phone_number: string;
  purpose: string;
  building: string;
};

const EMPTY_FORM: VisitorForm = { student: '', visitor_name: '', phone_number: '', purpose: '', building: '' };

export default function VisitorModule() {
  const [visitors, setVisitors] = useState<api.Visitor[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [buildings, setBuildings] = useState<api.Building[]>([]);
  const [students, setStudents] = useState<api.StudentBrief[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [filter, setFilter] = useState<'active' | 'history'>('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VisitorForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, counts] = await Promise.all([
        api.getVisitors(filter === 'active' ? { active: 1 } : { status: 'CHECKED_OUT' }),
        api.getVisitorSummary(),
      ]);
      setVisitors(list.results || []);
      setSummary(counts);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load the visitor log.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.getBuildings()
      .then((response) => setBuildings(Array.isArray(response) ? response : response.results || []))
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      api.getStudents({ q: studentQuery, page_size: 10 })
        .then((response) => setStudents(response.results || []))
        .catch(() => setStudents([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [modalOpen, studentQuery]);

  const filtered = visitors.filter((visitor) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return (
      visitor.visitor_name.toLowerCase().includes(needle) ||
      String(visitor.phone_number || '').includes(needle) ||
      String(visitor.student_detail?.reg_no || '').toLowerCase().includes(needle)
    );
  });

  const checkOut = async (id: number) => {
    setSaving(true);
    setError('');
    try {
      await api.checkoutVisitor(id);
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not check the visitor out.');
    } finally {
      setSaving(false);
    }
  };

  const saveVisitor = async () => {
    if (!form.student || !form.visitor_name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.createVisitor({
        student: Number(form.student),
        visitor_name: form.visitor_name.trim(),
        phone_number: form.phone_number.trim(),
        purpose: form.purpose.trim(),
        building: form.building ? Number(form.building) : null,
      });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setStudentQuery('');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not check the visitor in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Visitor logbook"
        subtitle="Secure check-in and one-click check-out at the hostel gate."
        right={
          <button type="button" className={btnPrimary} onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> New visitor
          </button>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Currently inside" value={summary?.active ?? 0} hint="Checked in and not yet out" icon={Users} tone="green" />
        <StatCard label="Checked out today" value={summary?.checked_out_today ?? 0} hint="Completed visits" icon={LogOut} tone="blue" />
        <StatCard label="Total visits today" value={summary?.today_total ?? 0} hint="All entries logged today" icon={ShieldCheck} tone="amber" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setFilter('active')}
              className={cx('rounded-md px-3 py-1.5 text-sm font-semibold', filter === 'active' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600')}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setFilter('history')}
              className={cx('rounded-md px-3 py-1.5 text-sm font-semibold', filter === 'history' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600')}
            >
              History
            </button>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              className={cx(inputClass, 'pl-9')}
              placeholder="Search visitor, phone or student roll no."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <Spinner label="Loading visitors…" />
        ) : filtered.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={UserCheck} title="No visitors found" message="New check-ins will appear here in real time." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Visitor</th>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Purpose</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Exit</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((visitor) => (
                  <tr key={visitor.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-gray-900">{visitor.visitor_name}</p>
                      <p className="text-xs text-gray-500">{visitor.phone_number || '—'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-800">{visitor.student_detail?.name || '—'}</p>
                      <p className="text-xs text-gray-500">{visitor.student_detail?.reg_no}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{visitor.purpose || '—'}</td>
                    <td className="px-3 py-3 text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {formatDateTime(visitor.entry_at)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{visitor.exit_at ? formatDateTime(visitor.exit_at) : '—'}</td>
                    <td className="px-3 py-3">
                      <Badge tone={visitor.status === 'CHECKED_IN' ? 'green' : 'gray'}>
                        {visitor.status_display || visitor.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {visitor.status === 'CHECKED_IN' ? (
                        <button type="button" className={btnSecondary} onClick={() => checkOut(visitor.id)} disabled={saving}>
                          <LogOut className="h-4 w-4" /> Check out
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">Closed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title="Check in a visitor"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={saveVisitor} disabled={saving || !form.student || !form.visitor_name.trim()}>
              {saving ? 'Saving…' : 'Check in'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Student roll number / name" required>
            <input
              className={inputClass}
              placeholder="Type to search students"
              value={studentQuery}
              onChange={(event) => {
                setStudentQuery(event.target.value);
                setForm({ ...form, student: '' });
              }}
            />
            {studentQuery && !form.student ? (
              <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                {students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => {
                      setForm({ ...form, student: String(student.id) });
                      setStudentQuery(`${student.name} (${student.reg_no})`);
                    }}
                    className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-blue-50"
                  >
                    <span className="font-semibold text-gray-800">{student.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{student.reg_no}</span>
                  </button>
                ))}
                {students.length === 0 ? <p className="px-3 py-2 text-xs text-gray-500">No students matched.</p> : null}
              </div>
            ) : null}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Visitor name" required>
              <input className={inputClass} value={form.visitor_name} onChange={(event) => setForm({ ...form, visitor_name: event.target.value })} />
            </Field>
            <Field label="Phone number">
              <input className={inputClass} value={form.phone_number} onChange={(event) => setForm({ ...form, phone_number: event.target.value })} />
            </Field>
            <Field label="Hostel block">
              <select className={inputClass} value={form.building} onChange={(event) => setForm({ ...form, building: event.target.value })}>
                <option value="">Select block</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Purpose" className="sm:col-span-2">
              <textarea className={cx(inputClass, 'min-h-[72px]')} value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder="Parent visit, delivery, etc." />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
