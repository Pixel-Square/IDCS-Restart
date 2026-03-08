import React from 'react';
import { CheckCircle, XCircle, Clock, FileText, Send } from 'lucide-react';
import type { EventStatus } from '../../../store/eventStore';

interface Props {
  status: EventStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<EventStatus, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  Draft:                     { label: 'Draft',                     color: 'text-gray-600',   bg: 'bg-gray-100',   border: 'border-gray-200',   Icon: FileText    },
  'Pending IQAC Approval':   { label: 'Pending IQAC Approval',    color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200',  Icon: Send        },
  'Pending Branding Approval': { label: 'Forwarded to Branding', color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200', Icon: Clock       },
  Approved:                  { label: 'Approved',                 color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200',  Icon: CheckCircle },
  'Rejected by IQAC':        { label: 'Rejected by IQAC',         color: 'text-rose-700',   bg: 'bg-rose-50',    border: 'border-rose-200',   Icon: XCircle     },
  'Rejected by Branding':    { label: 'Rejected by Branding',     color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200',    Icon: XCircle     },
};

export default function ApprovalStatusBadge({ status, size = 'md' }: Props) {
  const { label, color, bg, border, Icon } = CONFIG[status] ?? CONFIG['Draft'];
  const pad   = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const iSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${pad} ${color} ${bg} ${border}`}>
      <Icon className={`${iSize} flex-shrink-0`} />
      {label}
    </span>
  );
}
