import React from 'react';
import { AlertCircle, Loader2, RefreshCw, X } from 'lucide-react';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-500';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60';

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-60';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60';

export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60';

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('rounded-2xl border border-gray-200 bg-white shadow-sm', className)}>{children}</div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

const toneMap: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
};

export function Badge({
  children,
  tone = 'gray',
  className = '',
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneMap | string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        toneMap[tone] || toneMap.gray,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'blue',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';
}) {
  const iconTone: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className={cx('rounded-xl p-2', iconTone[tone] || iconTone.blue)}>
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-gray-500">{hint}</span> : null}
    </label>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      ) : null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-10 text-center">
      {Icon ? <Icon className="mb-2 h-7 w-7 text-gray-400" /> : null}
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {message ? <p className="mt-1 max-w-md text-xs text-gray-500">{message}</p> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6">
      <div
        className={cx(
          'my-4 w-full rounded-2xl bg-white shadow-2xl',
          wide ? 'max-w-3xl' : 'max-w-xl',
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{value || '—'}</p>
    </div>
  );
}

export function statusTone(status?: string): string {
  const value = String(status || '').toUpperCase();
  if (['APPROVED', 'PAID', 'ACTIVE', 'CLEARED', 'COMPLETED', 'RESOLVED', 'CLOSED', 'GOOD'].includes(value)) return 'green';
  if (['PENDING', 'PARTIAL', 'ASSIGNED', 'IN_PROGRESS', 'ROOM_VERIFIED', 'ASSETS_VERIFIED', 'DUES_CLEARED', 'UNDER_REPAIR', 'FAIR'].includes(value)) return 'amber';
  if (['REJECTED', 'CANCELLED', 'VACATED', 'TRANSFERRED', 'OVERDUE', 'DAMAGED', 'EXPIRED', 'INACTIVE'].includes(value)) return 'red';
  if (['NOT_SUBMITTED', 'MAINTENANCE'].includes(value)) return 'gray';
  return 'blue';
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMoney(value?: string | number | null) {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return `₹${value}`;
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
