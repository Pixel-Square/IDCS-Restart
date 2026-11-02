import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  LayoutDashboard,
  Loader2,
  Megaphone,
  ShieldCheck,
  UserCheck,
  Utensils,
} from 'lucide-react';
import { getMe } from '../../services/auth';
import { cx } from './HostelUI';
import MessModule from './modules/MessModule';
import VisitorModule from './modules/VisitorModule';
import MovementModule from './modules/MovementModule';
import AnnouncementsModule from './modules/AnnouncementsModule';
import InventoryModule from './modules/InventoryModule';
import DashboardModule from './modules/DashboardModule';

type TabKey = 'dashboard' | 'mess' | 'visitors' | 'movement' | 'announcements' | 'inventory';

const ADMIN_ROLES = new Set([
  'ADMIN',
  'SUPER_ADMIN',
  'COLLEGE_ADMIN',
  'HOSTEL_ADMIN',
  'PRINCIPAL',
  'IQAC',
]);
const WARDEN_ROLES = new Set(['WARDEN', 'DEPUTY_WARDEN', 'MATRON', 'HOSTEL_WARDEN']);

export default function HostelModulesPage() {
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((payload) => {
        if (!cancelled) setMe(payload || {});
      })
      .catch(() => {
        if (!cancelled) setMe({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const roles = useMemo<Set<string>>(() => {
    const raw = Array.isArray(me?.roles) ? me.roles : [];
    return new Set<string>(
      raw.map((role: any) => String(typeof role === 'string' ? role : role?.name || '').toUpperCase()),
    );
  }, [me]);

  const isSuperuser = Boolean(me?.is_superuser);
  const isAdmin = isSuperuser || Array.from(roles).some((role) => ADMIN_ROLES.has(role));
  const isWarden = Array.from(roles).some((role) => WARDEN_ROLES.has(role));
  const isSecurity = roles.has('SECURITY') || roles.has('SECURITY_STAFF');
  const isStudent = String(me?.profile_type || '').toUpperCase() === 'STUDENT' || roles.has('STUDENT');
  const isMessStaff = roles.has('MESS_COORDINATOR') || isWarden || isAdmin;
  const isMaintenanceStaff = roles.has('MAINTENANCE_STAFF') || isWarden || isAdmin;
  const isHostelStaff = isAdmin || isWarden || isSecurity || isMessStaff || isMaintenanceStaff;
  const canApprove = isAdmin || isWarden;
  const canOperateGate = isAdmin || isWarden || isSecurity;

  const tabs = useMemo(() => {
    const items: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [];
    if (isHostelStaff) items.push({ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard });
    items.push({ key: 'mess', label: 'Mess', icon: Utensils });
    if (isHostelStaff) items.push({ key: 'visitors', label: 'Visitors', icon: UserCheck });
    items.push({ key: 'movement', label: 'Movement', icon: ShieldCheck });
    items.push({ key: 'announcements', label: 'Announcements', icon: Megaphone });
    if (isMaintenanceStaff) items.push({ key: 'inventory', label: 'Inventory', icon: Boxes });
    return items;
  }, [isHostelStaff, isMaintenanceStaff]);

  const [tab, setTab] = useState<TabKey>('mess');

  useEffect(() => {
    if (tabs.length && !tabs.some((item) => item.key === tab)) {
      setTab(tabs[0].key);
    }
  }, [tabs, tab]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading hostel workspace…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hostel operations</h1>
            <p className="mt-1 text-sm text-gray-500">
              Mess, visitors, student movement, announcements and inventory in one workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition',
                    tab === item.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {!isHostelStaff && !isStudent ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Your account has no hostel role assigned. Ask the hostel administrator for access.
          </div>
        ) : null}

        {tab === 'dashboard' && isHostelStaff ? <DashboardModule /> : null}
        {tab === 'mess' ? <MessModule canManage={isMessStaff} /> : null}
        {tab === 'visitors' && isHostelStaff ? <VisitorModule /> : null}
        {tab === 'movement' ? (
          <MovementModule
            isStudent={isStudent}
            canApprove={canApprove}
            canOperateGate={canOperateGate}
          />
        ) : null}
        {tab === 'announcements' ? <AnnouncementsModule canManage={canApprove} /> : null}
        {tab === 'inventory' && isMaintenanceStaff ? <InventoryModule /> : null}
      </div>
    </div>
  );
}
