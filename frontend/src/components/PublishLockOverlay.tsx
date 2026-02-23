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
      {/* Lock banner at the top */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: '#ffffff',
            border: '2px solid #fde68a',
            borderRadius: 12,
            padding: '12px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              flex: '0 0 auto',
            }}
          >
            <LockIcon size={20} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#111827', fontSize: 14 }}>{title || 'Locked by IQAC'}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {subtitle || 'Publishing is turned OFF globally for this assessment.'}
            </div>
          </div>
        </div>
      </div>
      {/* Table content with slight blur when locked */}
      <div style={{ filter: 'brightness(0.97)', pointerEvents: 'none', userSelect: 'none' }}>{children}</div>
    </div>
  );
}
