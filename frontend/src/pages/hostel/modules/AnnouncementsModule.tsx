import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  Megaphone,
  Plus,
  Send,
  Trash2,
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
  btnPrimary,
  btnSecondary,
  cx,
  formatDateTime,
  inputClass,
} from '../HostelUI';

const priorityTone = (priority: string) => {
  if (priority === 'EMERGENCY') return 'red';
  if (priority === 'URGENT') return 'amber';
  return 'blue';
};

type Props = { canManage: boolean };

export default function AnnouncementsModule({ canManage }: Props) {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="Notifications & announcements"
        subtitle={canManage ? 'Broadcast to hostellers by block or year and track acknowledgments.' : 'Stay informed. Mark announcements as read.'}
      />
      {canManage ? <BroadcastManager /> : <StudentFeed />}
    </div>
  );
}

function BroadcastManager() {
  const [rows, setRows] = useState<api.Announcement[]>([]);
  const [buildings, setBuildings] = useState<api.Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    priority: 'NORMAL',
    target_audience: 'ALL',
    building: '',
    target_year: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getAnnouncements();
      setRows(response.results || []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load announcements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    api.getBuildings()
      .then((response) => setBuildings(Array.isArray(response) ? response : response.results || []))
      .catch(() => setBuildings([]));
  }, [load]);

  const publish = async () => {
    setSaving(true);
    setError('');
    try {
      await api.createAnnouncement({
        title: form.title,
        message: form.message,
        priority: form.priority as any,
        target_audience: form.target_audience,
        building: form.target_audience === 'BLOCK' && form.building ? Number(form.building) : null,
        target_year: form.target_audience === 'YEAR' && form.target_year ? Number(form.target_year) : null,
      });
      setModalOpen(false);
      setForm({ title: '', message: '', priority: 'NORMAL', target_audience: 'ALL', building: '', target_year: '' });
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not publish the announcement.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Delete this announcement?')) return;
    setSaving(true);
    try {
      await api.deleteAnnouncement(id);
      await load();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Could not delete the announcement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onRetry={load} />
      <div className="flex justify-end">
        <button type="button" className={btnPrimary} onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> New broadcast
        </button>
      </div>

      {loading ? (
        <Spinner label="Loading announcements…" />
      ) : rows.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={Megaphone} title="No announcements yet" message="Broadcast an update to students." />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className={cx('p-4', row.priority === 'EMERGENCY' && 'border-red-200')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-gray-900">{row.title}</p>
                    <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>
                    <Badge tone="gray">{row.target_audience}{row.target_year ? ` · Year ${row.target_year}` : ''}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{row.message}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {formatDateTime(row.published_at)} · {row.created_by_name || 'Admin'} · {row.read_count ?? 0} read
                  </p>
                </div>
                <button type="button" className="text-red-500 hover:text-red-700" onClick={() => remove(row.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Publish announcement"
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={publish} disabled={saving || !form.title.trim() || !form.message.trim()}>
              <Send className="h-4 w-4" /> Publish
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <input className={inputClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </Field>
          <Field label="Message" required className="sm:col-span-2">
            <textarea className={cx(inputClass, 'min-h-[96px]')} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
          </Field>
          <Field label="Priority">
            <select className={inputClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              <option value="NORMAL">Normal</option>
              <option value="URGENT">Urgent</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </Field>
          <Field label="Target audience">
            <select className={inputClass} value={form.target_audience} onChange={(event) => setForm({ ...form, target_audience: event.target.value })}>
              <option value="ALL">All students</option>
              <option value="HOSTELLERS">All hostellers</option>
              <option value="BLOCK">Specific hostel block</option>
              <option value="YEAR">Specific year</option>
            </select>
          </Field>
          {form.target_audience === 'BLOCK' ? (
            <Field label="Hostel block" required>
              <select className={inputClass} value={form.building} onChange={(event) => setForm({ ...form, building: event.target.value })}>
                <option value="">Select block</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.name}</option>
                ))}
              </select>
            </Field>
          ) : null}
          {form.target_audience === 'YEAR' ? (
            <Field label="Study year" required>
              <select className={inputClass} value={form.target_year} onChange={(event) => setForm({ ...form, target_year: event.target.value })}>
                <option value="">Select year</option>
                {[1, 2, 3, 4, 5].map((year) => <option key={year} value={year}>Year {year}</option>)}
              </select>
            </Field>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function StudentFeed() {
  const [rows, setRows] = useState<api.Announcement[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getMyAnnouncements(unreadOnly ? { unread: 1 } : {});
      setRows(response.results || []);
      setSummary(response.summary);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: number) => {
    try {
      await api.markAnnouncementRead(id);
      setRows((current) => current.map((row) => (row.id === id ? { ...row, is_read: true } : row)));
      setSummary((current: any) => current ? { ...current, unread: Math.max((current.unread || 1) - 1, 0) } : current);
    } catch (readError: any) {
      setError(readError?.message || 'Could not mark as read.');
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onRetry={load} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Badge tone="red">{summary?.emergency ?? 0} emergency</Badge>
          <Badge tone="amber">{summary?.unread ?? 0} unread</Badge>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
          Unread only
        </label>
      </div>

      {loading ? (
        <Spinner label="Loading notifications…" />
      ) : rows.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={Bell} title="You are all caught up" message="New announcements will appear here." />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className={cx('p-4', !row.is_read && 'border-blue-200 bg-blue-50/30')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {!row.is_read ? <BellRing className="h-4 w-4 text-blue-600" /> : <Bell className="h-4 w-4 text-gray-400" />}
                    <p className="text-sm font-bold text-gray-900">{row.title}</p>
                    <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{row.message}</p>
                  <p className="mt-1 text-[11px] text-gray-500">{formatDateTime(row.published_at)} · {row.created_by_name || 'Hostel office'}</p>
                </div>
                {!row.is_read ? (
                  <button type="button" className={btnSecondary} onClick={() => markRead(row.id)}>
                    <Check className="h-4 w-4" /> Mark read
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Read
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
