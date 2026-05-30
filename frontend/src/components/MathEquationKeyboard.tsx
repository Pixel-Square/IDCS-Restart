import React, { useEffect, useState, useRef } from 'react';
import { X, Keyboard, Zap, TreePine, Image as ImageIcon } from 'lucide-react';
import 'mathlive';

interface MathEquationKeyboardProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (latex: string) => void;
  initialValue?: string;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': any;
    }
  }
}

export default function MathEquationKeyboard({ isOpen, onClose, onApply, initialValue = '' }: MathEquationKeyboardProps) {
  const mfRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen && mfRef.current) {
      mfRef.current.value = initialValue;
      setTimeout(() => mfRef.current.focus(), 100);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '500px',
      backgroundColor: 'white',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
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
          <Keyboard size={18} color="#3b82f6" />
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Math & Equations Editor</span>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ padding: '20px' }}>
        <math-field
          ref={mfRef}
          style={{
            width: '100%',
            fontSize: '20px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            padding: '8px'
          }}
          onInput={(e: any) => {
            // Can track real-time if needed
          }}
        />
        
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7280' }}>
          Tip: You can use LaTeX commands like \matrix, \frac, \sqrt, etc.
        </div>
      </div>

      <div style={{
        padding: '12px 16px',
        backgroundColor: '#f9fafb',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px'
      }}>
        <button 
          onClick={onClose}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            backgroundColor: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button 
          onClick={() => {
            if (mfRef.current) {
              onApply(mfRef.current.value);
            }
          }}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Insert Equation
        </button>
      </div>
    </div>
  );
}
