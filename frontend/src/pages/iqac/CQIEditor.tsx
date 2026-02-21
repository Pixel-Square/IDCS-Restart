import React, { useState, useEffect } from 'react';

type CQIOptionId =
  | 'cia1_co1_co2'
  | 'cia2_co3_co4'
  | 'model_co1_co2_co3_co4_co5'
  | 'model_co3_co4_co5'
  | 'model_co5';

type CQIOptionSetting = {
  id: CQIOptionId;
  name?: string;
};

export type CQIEditorConfig = {
  // Backward compatible: options can be string ids or objects with id+name.
  options: Array<CQIOptionId | CQIOptionSetting | any>;
  divider: number;
  multiplier: number;
};

interface CQIEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cfg: CQIEditorConfig) => void;
  currentSelection: CQIEditorConfig;
}

const CQI_OPTIONS = [
  { id: 'cia1_co1_co2', label: 'CIA 1', cos: ['CO1', 'CO2'], assessment: 'cia1' },
  { id: 'cia2_co3_co4', label: 'CIA 2', cos: ['CO3', 'CO4'], assessment: 'cia2' },
  { id: 'model_co1_co2_co3_co4_co5', label: 'MODEL', cos: ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'], assessment: 'model' },
  { id: 'model_co3_co4_co5', label: 'MODEL', cos: ['CO3', 'CO4', 'CO5'], assessment: 'model' },
  { id: 'model_co5', label: 'MODEL', cos: ['CO5'], assessment: 'model' },
] as const satisfies ReadonlyArray<{ id: CQIOptionId; label: string; cos: string[]; assessment: 'cia1' | 'cia2' | 'model' }>;

function normalizeOptionId(raw: any): CQIOptionId | null {
  const id = String(raw || '').trim().toLowerCase();
  if (id === 'cia1_co1_co2') return 'cia1_co1_co2';
  if (id === 'cia2_co3_co4') return 'cia2_co3_co4';
  if (id === 'model_co1_co2_co3_co4_co5') return 'model_co1_co2_co3_co4_co5';
  if (id === 'model_co3_co4_co5') return 'model_co3_co4_co5';
  if (id === 'model_co5') return 'model_co5';
  return null;
}

function parseSelectedOptions(rawOptions: Array<any>): { selected: Set<CQIOptionId>; names: Record<CQIOptionId, string> } {
  const selected = new Set<CQIOptionId>();
  const names: Record<CQIOptionId, string> = {
    cia1_co1_co2: 'CIA 1',
    cia2_co3_co4: 'CIA 2',
    model_co1_co2_co3_co4_co5: 'MODEL',
    model_co3_co4_co5: 'MODEL',
    model_co5: 'MODEL',
  };

  const arr = Array.isArray(rawOptions) ? rawOptions : [];
  for (const it of arr) {
    if (typeof it === 'string') {
      const id = normalizeOptionId(it);
      if (id) selected.add(id);
      continue;
    }
    if (it && typeof it === 'object') {
      const id = normalizeOptionId((it as any).id);
      if (!id) continue;
      selected.add(id);
      const nm = String((it as any).name || '').trim();
      if (nm) names[id] = nm;
    }
  }
  return { selected, names };
}

export default function CQIEditor({ isOpen, onClose, onSave, currentSelection }: CQIEditorProps) {
  const parsedInitial = parseSelectedOptions(currentSelection.options);
  const [selected, setSelected] = useState<Set<CQIOptionId>>(parsedInitial.selected);
  const [optionNames, setOptionNames] = useState<Record<CQIOptionId, string>>(parsedInitial.names);
  const [divider, setDivider] = useState<number>(Number(currentSelection.divider) || 2);
  const [multiplier, setMultiplier] = useState<number>(Number(currentSelection.multiplier) || 0.15);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const parsed = parseSelectedOptions(currentSelection.options);
    setSelected(parsed.selected);
    setOptionNames(parsed.names);
    setDivider(Number(currentSelection.divider) || 2);
    setMultiplier(Number(currentSelection.multiplier) || 0.15);
    setError('');
  }, [currentSelection, isOpen]);

  const handleCheckboxChange = (optionId: CQIOptionId) => {
    const newSelected = new Set(selected);
    if (newSelected.has(optionId)) {
      newSelected.delete(optionId);
      setSelected(newSelected);
      setError('');
    } else {
      const newOption = CQI_OPTIONS.find(opt => opt.id === optionId);
      if (newOption) {
        const currentCOs = new Set<string>();
        newSelected.forEach(selectedId => {
          const opt = CQI_OPTIONS.find(o => o.id === selectedId);
          if (opt) opt.cos.forEach(co => currentCOs.add(co));
        });
        const newCOs = newOption.cos;
        const overlappingCOs = newCOs.filter(co => currentCOs.has(co));
        if (overlappingCOs.length > 0) {
          setError(`Cannot select this option: ${overlappingCOs.join(', ')} already selected in another option. Only one option per CO is allowed.`);
          return;
        }
        newSelected.add(optionId);
        setSelected(newSelected);
        setError('');
      }
    }
  };

  const handleSave = () => {
    const d = Number(divider);
    const m = Number(multiplier);
    if (!Number.isFinite(d) || d <= 0) {
      setError('Divider must be a number greater than 0.');
      return;
    }
    if (!Number.isFinite(m) || m < 0) {
      setError('Multiplier must be a number greater than or equal to 0.');
      return;
    }
    setError('');
    const opts: CQIOptionSetting[] = Array.from(selected).map((id) => ({
      id,
      name: String(optionNames?.[id] || '').trim() || undefined,
    }));
    onSave({ options: opts, divider: d, multiplier: m });
    onClose();
  };

  const handleCancel = () => {
    setError('');
    const parsed = parseSelectedOptions(currentSelection.options);
    setSelected(parsed.selected);
    setOptionNames(parsed.names);
    setDivider(Number(currentSelection.divider) || 2);
    setMultiplier(Number(currentSelection.multiplier) || 0.15);
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>CQI Editor</h2>
          <button onClick={handleCancel} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b', padding: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Close">×</button>
        </div>

        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>Select when to show the CQI buttons. Multiple options can be selected as long as COs don't overlap.</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>TOTAL&lt;58 Divider</div>
            <input type="number" value={String(divider)} onChange={(e) => setDivider(Number(e.target.value))} className="obe-input" min={0.1} step={0.1} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>TOTAL≥58 Multiplier</div>
            <input type="number" value={String(multiplier)} onChange={(e) => setMultiplier(Number(e.target.value))} className="obe-input" min={0} step={0.01} />
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, marginBottom: 16, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {CQI_OPTIONS.map((option) => (
            <label key={option.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, border: '2px solid', borderColor: selected.has(option.id) ? '#3b82f6' : '#e2e8f0', borderRadius: 8, cursor: 'pointer', backgroundColor: selected.has(option.id) ? '#eff6ff' : 'white', transition: 'all 0.2s' }}>
              <input type="checkbox" checked={selected.has(option.id)} onChange={() => handleCheckboxChange(option.id)} style={{ marginTop: 3, width: 18, height: 18, cursor: 'pointer' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{option.label} - {option.cos.join(' and ')}</div>
                  <div style={{ minWidth: 190 }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>Display name</div>
                    <input
                      type="text"
                      value={String(optionNames?.[option.id] || option.label)}
                      onChange={(e) => {
                        const v = String(e.target.value || '');
                        setOptionNames((prev) => ({ ...prev, [option.id]: v }));
                      }}
                      className="obe-input"
                      style={{ padding: 8 }}
                      placeholder={option.label}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Show CQI button after {option.label} exam</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={handleCancel} className="obe-btn" style={{ minWidth: 80 }}>Cancel</button>
          <button onClick={handleSave} className="obe-btn obe-btn-primary" style={{ minWidth: 80 }}>Save</button>
        </div>
      </div>
    </div>
  );
}
