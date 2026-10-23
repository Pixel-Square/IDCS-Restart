import React, { useCallback, useEffect, useState } from 'react';
import {
  Boxes,
  CircleDollarSign,
  Plus,
  Search,
  Wrench,
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
  formatMoney,
  inputClass,
  statusTone,
} from '../HostelUI';

const CATEGORIES = [
  { key: 'FURNITURE', label: 'Furniture' },
  { key: 'ELECTRICAL', label: 'Electrical' },
  { key: 'COMMON_FACILITY', label: 'Common Facility' },
  { key: 'OTHER', label: 'Other' },
];

const STATUSES = [
  { key: 'GOOD', label: 'Good' },
  { key: 'NEEDS_REPAIR', label: 'Needs Repair' },
  { key: 'DAMAGED', label: 'Damaged' },
  { key: 'DISPOSED', label: 'Disposed' },
];

export default function InventoryModule() {
  const [rows, setRows] = useState<api.Asset[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [buildings, setBuildings] = useState<api.Building[]>([]);
  const [filters, setFilters] = useState({ q: '', category: '', status: '', building: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    asset_code: '',
    name: '',
    category: 'FURNITURE',
    status: 'GOOD',
    building: '',
    quantity: '1',
    cost: '0',
    purchase_date: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, counts] = await Promise.all([
        api.getAssets(filters),
        api.getAssetSummary(),
      ]);
      setRows(list.results || []);
      setSummary(counts);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.getBuildings()
      .then((response) => setBuildings(Array.isArray(response) ? response : response.results || []))
      .catch(() => setBuildings([]));
  }, []);

  const create = async () => {
    setSaving(true);
    setError('');
    try {
      await api.createAsset({
        asset_code: form.asset_code.trim(),
        name: form.name.trim(),
        category: form.category as any,
        status: form.status as any,
        building: form.building ? Number(form.building) : null,
        quantity: Number(form.quantity || 1),
        cost: form.cost || '0',
        purchase_date: form.purchase_date || null,
      });
      setModalOpen(false);
      setForm({ asset_code: '', name: '', category: 'FURNITURE', status: 'GOOD', building: '', quantity: '1', cost: '0', purchase_date: '' });
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not add the asset.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (row: api.Asset, status: string) => {
    setSaving(true);
    try {
      const updated = await api.setAssetStatus(row.id, status);
      setRows((current) => current.map((item) => (item.id === row.id ? updated : item)));
      const counts = await api.getAssetSummary();
      setSummary(counts);
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not update the asset status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Inventory & assets"
        subtitle="Track furniture, electrical fittings and common facilities across blocks."
        right={
          <button type="button" className={btnPrimary} onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add asset
          </button>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total assets" value={summary?.total_assets ?? 0} hint={`${summary?.total_quantity ?? 0} units`} icon={Boxes} tone="blue" />
        <StatCard label="Good condition" value={summary?.good ?? 0} hint="Ready for use" icon={Wrench} tone="green" />
        <StatCard label="Needs repair" value={(summary?.needs_repair ?? 0) + (summary?.damaged ?? 0)} hint="Maintenance queue" icon={Wrench} tone="amber" />
        <StatCard label="Inventory value" value={formatMoney(summary?.total_cost ?? 0)} hint="Purchase cost" icon={CircleDollarSign} tone="purple" />
      </div>

      <Card className="p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              className={cx(inputClass, 'pl-9')}
              placeholder="Search code, name or room"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </div>
          <select className={inputClass} value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            <option value="">All categories</option>
            {CATEGORIES.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
          </select>
          <select className={inputClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">All statuses</option>
            {STATUSES.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
          </select>
          <select className={inputClass} value={filters.building} onChange={(event) => setFilters({ ...filters, building: event.target.value })}>
            <option value="">All blocks</option>
            {buildings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>

        {loading ? (
          <Spinner label="Loading inventory…" />
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={Boxes} title="No assets match the filters" message="Adjust the filters or add a new asset." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Asset</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Block / Room</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Cost</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.asset_code}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{row.asset_name || row.name}</td>
                    <td className="px-3 py-2"><Badge tone="blue">{row.category_display || row.category}</Badge></td>
                    <td className="px-3 py-2 text-gray-600">
                      {row.building_name || '—'}{row.room_number ? ` / ${row.room_number}` : ''}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.quantity}</td>
                    <td className="px-3 py-2 text-gray-600">{formatMoney(row.cost)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(row.status)}>{row.status_display || row.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <select
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                        value={row.status}
                        onChange={(event) => updateStatus(row, event.target.value)}
                        disabled={saving}
                      >
                        {STATUSES.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
                      </select>
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
        title="Add asset"
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={create} disabled={saving || !form.asset_code.trim() || !form.name.trim()}>
              {saving ? 'Saving…' : 'Add asset'}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Asset code" required>
            <input className={inputClass} value={form.asset_code} onChange={(event) => setForm({ ...form, asset_code: event.target.value })} placeholder="BED-101" />
          </Field>
          <Field label="Asset name" required>
            <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Single bed" />
          </Field>
          <Field label="Category">
            <select className={inputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {CATEGORIES.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {STATUSES.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
            </select>
          </Field>
          <Field label="Hostel block">
            <select className={inputClass} value={form.building} onChange={(event) => setForm({ ...form, building: event.target.value })}>
              <option value="">Common / unassigned</option>
              {buildings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </Field>
          <Field label="Quantity">
            <input type="number" min="1" className={inputClass} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
          </Field>
          <Field label="Cost">
            <input type="number" min="0" step="0.01" className={inputClass} value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
          </Field>
          <Field label="Purchase date">
            <input type="date" className={inputClass} value={form.purchase_date} onChange={(event) => setForm({ ...form, purchase_date: event.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
