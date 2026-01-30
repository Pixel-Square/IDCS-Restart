import React from 'react';

interface FA1PageProps {
  onBack: () => void;
}

export default function FA1Page({ onBack }: FA1PageProps) {
  return (
    <div style={{ padding: '20px' }}>
      <button
        onClick={onBack}
        style={{
          padding: '10px 16px',
          fontSize: '14px',
          backgroundColor: '#f5f5f5',
          color: '#000',
          border: '1px solid #d9d9d9',
          borderRadius: '6px',
          cursor: 'pointer',
          marginBottom: '20px',
          transition: 'background-color 0.3s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e6e6e6')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
      >
        ← Back
      </button>

      <h2>FA1</h2>
      <div style={{
        padding: '20px',
        border: '1px solid #d9d9d9',
        borderRadius: '6px',
        backgroundColor: '#fafafa',
        minHeight: '400px',
      }}>
        <p style={{ color: '#999', marginTop: '40px', textAlign: 'center' }}>
          This page is ready for content. Add your FA1 content here.
        </p>
      </div>
    </div>
  );
}
