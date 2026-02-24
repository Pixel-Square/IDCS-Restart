import React from 'react';

type Props = {
  children?: React.ReactNode;
};

export default function AssessmentContainer({ children }: Props) {
  const pageBgStyle: React.CSSProperties = {
    // match the SSA1 page look: full-height gradient with side padding
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 65%)',
    padding: '18px 14px',
  };

  const pageShellStyle: React.CSSProperties = {
    // constrain width and centre the sheet card
    maxWidth: 1400,
    margin: '0 auto',
  };

  const sheetCardStyle: React.CSSProperties = {
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.88)',
    boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
    padding: 16,
    backdropFilter: 'blur(10px)',
    overflowX: 'auto' as const,
    minWidth: 0,
  };

  return (
    <div style={pageBgStyle}>
      <div style={{ ...pageShellStyle, ...sheetCardStyle }}>{children}</div>
    </div>
  );
}
