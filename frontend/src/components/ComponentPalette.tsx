import React from 'react';
import { X, Zap } from 'lucide-react';

interface ComponentPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (component: string) => void;
  title: string;
  icon: React.ReactNode;
  items: { label: string; value: string; icon?: string }[];
}

export default function ComponentPalette({ isOpen, onClose, onSelect, title, icon, items }: ComponentPaletteProps) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '400px',
      backgroundColor: 'white',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon}
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{title}</span>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
        {items.map((item, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(item.value)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '12px',
              border: '1px solid #f3f4f6',
              borderRadius: '8px',
              backgroundColor: 'white',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
          >
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
