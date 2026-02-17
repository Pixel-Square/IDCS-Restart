import React, { useState, useEffect } from 'react';

type CQIOption = 'cia1_co1_co2' | 'cia2_co3_co4' | 'model_co3_co4_co5' | 'model_co5';

interface CQIEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedOptions: CQIOption[]) => void;
  currentSelection: CQIOption[];
}

const CQI_OPTIONS = [
  { id: 'cia1_co1_co2', label: 'CIA 1', cos: ['CO1', 'CO2'], assessment: 'cia1' },
  { id: 'cia2_co3_co4', label: 'CIA 2', cos: ['CO3', 'CO4'], assessment: 'cia2' },
  { id: 'model_co3_co4_co5', label: 'MODEL', cos: ['CO3', 'CO4', 'CO5'], assessment: 'model' },
  { id: 'model_co5', label: 'MODEL', cos: ['CO5'], assessment: 'model' },
] as const;

export default function CQIEditor({ isOpen, onClose, onSave, currentSelection }: CQIEditorProps) {
  const [selected, setSelected] = useState<Set<CQIOption>>(new Set(currentSelection));
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setSelected(new Set(currentSelection));
    setError('');
  }, [currentSelection, isOpen]);

  const handleCheckboxChange = (optionId: CQIOption) => {
    const newSelected = new Set(selected);
    
    if (newSelected.has(optionId)) {
      // Uncheck if already selected
      newSelected.delete(optionId);
      setSelected(newSelected);
      setError('');
    } else {
      // Check if the new selection would create CO conflicts
      const newOption = CQI_OPTIONS.find(opt => opt.id === optionId);
      
      if (newOption) {
        // Collect all COs from currently selected options
        const currentCOs = new Set<string>();
        newSelected.forEach(selectedId => {
          const opt = CQI_OPTIONS.find(o => o.id === selectedId);
          if (opt) {
            opt.cos.forEach(co => currentCOs.add(co));
          }
        });
        
        // Check for CO overlap with new option
        const newCOs = newOption.cos;
        const overlappingCOs = newCOs.filter(co => currentCOs.has(co));
        
        if (overlappingCOs.length > 0) {
          setError(`Cannot select this option: ${overlappingCOs.join(', ')} already selected in another option. Only one option per CO is allowed.`);
          return;
        }
        
        // No overlap, add it
        newSelected.add(optionId);
        setSelected(newSelected);
        setError('');
      }
    }
  };

  const handleSave = () => {
    setError('');
    onSave(Array.from(selected));
    onClose();
  };

  const handleCancel = () => {
    setError('');
    setSelected(new Set(currentSelection));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={handleCancel}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 24,
          maxWidth: 500,
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
            CQI Editor
          </h2>
          <button
            onClick={handleCancel}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#64748b',
              padding: 0,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
          Select when to show the CQI buttons. Multiple options can be selected as long as COs don't overlap.
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#b91c1c',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {CQI_OPTIONS.map((option) => (
            <label
              key={option.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: 16,
                border: '2px solid',
                borderColor: selected.has(option.id as CQIOption) ? '#3b82f6' : '#e2e8f0',
                borderRadius: 8,
                cursor: 'pointer',
                backgroundColor: selected.has(option.id as CQIOption) ? '#eff6ff' : 'white',
                transition: 'all 0.2s',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(option.id as CQIOption)}
                onChange={() => handleCheckboxChange(option.id as CQIOption)}
                style={{
                  marginTop: 3,
                  width: 18,
                  height: 18,
                  cursor: 'pointer',
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                  {option.label} - {option.cos.join(' and ')}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Show CQI button after {option.label} exam
                </div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={handleCancel}
            className="obe-btn"
            style={{ minWidth: 80 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="obe-btn obe-btn-primary"
            style={{ minWidth: 80 }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
