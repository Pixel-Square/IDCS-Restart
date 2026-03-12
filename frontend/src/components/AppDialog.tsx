import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  X,
} from 'lucide-react';
import {
  registerDialogHandlers,
  showAlert,
  DialogType,
} from '../utils/dialog';

// ─── types ────────────────────────────────────────────────────────────────────

type DialogMode = 'alert' | 'confirm';

interface DialogEntry {
  id: number;
  message: string;
  type: DialogType;
  mode: DialogMode;
  resolve: (value: boolean) => void;
  visible: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;

const ICON: Record<DialogType, { el: React.ElementType; color: string; bg: string; ring: string }> = {
  success: { el: CheckCircle,    color: '#16a34a', bg: '#f0fdf4', ring: '#bbf7d0' },
  warning: { el: AlertTriangle,  color: '#d97706', bg: '#fffbeb', ring: '#fde68a' },
  error:   { el: XCircle,        color: '#dc2626', bg: '#fef2f2', ring: '#fecaca' },
  info:    { el: Info,           color: '#0b74b8', bg: '#eff8ff', ring: '#bae6fd' },
};

// ─── component ────────────────────────────────────────────────────────────────

export default function AppDialog() {
  const [dialogs, setDialogs] = useState<DialogEntry[]>([]);

  /** Animate out, then remove and resolve. */
  const closeDialog = useCallback((id: number, result: boolean) => {
    // Trigger fade-out
    setDialogs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, visible: false } : d)),
    );
    // After animation, remove & resolve
    setTimeout(() => {
      setDialogs((prev) => {
        const entry = prev.find((d) => d.id === id);
        if (entry) entry.resolve(result);
        return prev.filter((d) => d.id !== id);
      });
    }, 220);
  }, []);

  /** Push a new dialog; trigger transition on next tick. */
  const openDialog = useCallback(
    (message: string, type: DialogType, mode: DialogMode): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const id = ++_idCounter;
        setDialogs((prev) => [
          ...prev,
          { id, message, type, mode, resolve, visible: false },
        ]);
        // Let React paint the invisible state first, then show
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setDialogs((prev) =>
              prev.map((d) => (d.id === id ? { ...d, visible: true } : d)),
            );
          });
        });
      }),
    [],
  );

  useEffect(() => {
    // Register alert / confirm handlers
    registerDialogHandlers(
      (message, type = 'info') =>
        openDialog(message, type, 'alert').then(() => undefined),
      (message) => openDialog(message, 'info', 'confirm'),
    );

    // Override window.alert so existing call sites are automatically upgraded
    const originalAlert = (window as any)._originalAlert ?? window.alert;
    (window as any)._originalAlert = originalAlert;
    (window as any).alert = (msg?: any) => {
      showAlert(String(msg ?? ''));
    };

    return () => {
      // Restore on unmount (dev HMR safety)
      if ((window as any)._originalAlert) {
        window.alert = (window as any)._originalAlert;
      }
    };
  }, [openDialog]);

  if (dialogs.length === 0) return null;

  return createPortal(
    <>
      {dialogs.map((dialog) => (
        <DialogOverlay
          key={dialog.id}
          dialog={dialog}
          onClose={closeDialog}
        />
      ))}
    </>,
    document.body,
  );
}

// ─── single dialog overlay ────────────────────────────────────────────────────

interface OverlayProps {
  dialog: DialogEntry;
  onClose: (id: number, result: boolean) => void;
}

function DialogOverlay({ dialog, onClose }: OverlayProps) {
  const { id, message, type, mode, visible } = dialog;
  const icon = ICON[type];
  const IconEl = icon.el;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(id, false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [id, onClose]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: '16px',
    transition: 'opacity 200ms ease',
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? 'auto' : 'none',
  };

  const boxStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(2,6,23,0.18), 0 4px 16px rgba(2,6,23,0.08)',
    padding: '28px 28px 24px',
    maxWidth: '440px',
    width: '100%',
    transition: 'transform 220ms cubic-bezier(0.34,1.56,0.64,1), opacity 200ms ease',
    transform: visible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(8px)',
    opacity: visible ? 1 : 0,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    border: `1px solid ${icon.ring}`,
  };

  // Lines longer than ~80 chars get displayed in a multi-line block
  const isLong = message.length > 80 || message.includes('\n');

  return (
    <div style={overlayStyle} onClick={() => onClose(id, false)}>
      {/* Stop propagation so clicking inside box doesn't dismiss */}
      <div style={boxStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">

        {/* Icon row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: icon.bg,
            border: `1.5px solid ${icon.ring}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <IconEl size={22} color={icon.color} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: icon.color,
              marginBottom: '4px',
            }}>
              {type === 'success' ? 'Success'
               : type === 'error'   ? 'Error'
               : type === 'warning' ? 'Warning'
               : 'Info'}
            </div>
            <p style={{
              margin: 0,
              fontSize: isLong ? '0.875rem' : '0.95rem',
              color: '#1e293b',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {message}
            </p>
          </div>
          {/* Close × */}
          <button
            onClick={() => onClose(id, false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px', color: '#94a3b8', borderRadius: '6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: '#f1f5f9', margin: '0 0 20px' }} />

        {/* Action buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          {mode === 'confirm' && (
            <button
              onClick={() => onClose(id, false)}
              style={{
                padding: '9px 20px',
                borderRadius: '10px',
                border: '1.5px solid #e2e8f0',
                background: '#f8fafc',
                color: '#475569',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'background 150ms ease, border-color 150ms ease',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; }}
            >
              Cancel
            </button>
          )}
          <button
            autoFocus
            onClick={() => onClose(id, true)}
            style={{
              padding: '9px 24px',
              borderRadius: '10px',
              border: 'none',
              background: `linear-gradient(180deg, ${icon.color}, ${darken(icon.color, 0.12)})`,
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: `0 4px 14px ${hexAlpha(icon.color, 0.35)}`,
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
          >
            {mode === 'confirm' ? 'Confirm' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── tiny colour helper ────────────────────────────────────────────────────────

function hexAlpha(hex: string, alpha: number): string {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function darken(hex: string, amount: number): string {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((c >> 16) & 255) - Math.round(255 * amount));
  const g = Math.max(0, ((c >> 8) & 255) - Math.round(255 * amount));
  const b = Math.max(0, (c & 255) - Math.round(255 * amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
