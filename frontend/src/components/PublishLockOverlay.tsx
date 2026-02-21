import React from 'react';

type Props = {
  locked: boolean;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
};

function LockIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2"
        stroke="#111827"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6.5 10h11A2.5 2.5 0 0 1 20 12.5v6A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-6A2.5 2.5 0 0 1 6.5 10Z"
        fill="#F3F4F6"
        stroke="#111827"
        strokeWidth="1.2"
      />
      <path d="M12 14.2v2.6" stroke="#111827" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function PublishLockOverlay({ locked, title, subtitle, children }: Props) {
  if (!locked) return <>{children}</>;

  return (
    <div style={{ position: 'relative' }}>
      <div>{children}</div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: 'transparent',
          backdropFilter: 'none',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: '#ffffff',
            border: '2px solid #e5e7eb',
            borderRadius: 14,
            padding: '14px 18px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            maxWidth: 520,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              flex: '0 0 auto',
            }}
          >
            <LockIcon size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, color: '#111827' }}>{title || 'Locked by IQAC'}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {subtitle || 'Publishing is turned OFF globally for this assessment.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
