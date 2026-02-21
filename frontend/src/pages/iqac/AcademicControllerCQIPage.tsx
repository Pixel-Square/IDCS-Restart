import React, { useEffect, useState } from 'react';
import CQIEditor, { CQIEditorConfig } from './CQIEditor';
import { fetchIqacCqiConfig, upsertIqacCqiConfig } from '../../services/obe';

export default function AcademicControllerCQIPage(): JSX.Element {
  const defaultCfg: CQIEditorConfig = { options: [], divider: 2, multiplier: 0.15 };
  const [isOpen, setIsOpen] = useState(false);
  const [cfg, setCfg] = useState<CQIEditorConfig>(defaultCfg);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchIqacCqiConfig()
      .then((res) => {
        if (!mounted) return;
        setCfg({ options: Array.isArray(res.options) ? res.options : [], divider: Number.isFinite(Number(res.divider)) ? Number(res.divider) : 2, multiplier: Number.isFinite(Number(res.multiplier)) ? Number(res.multiplier) : 0.15 });
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleSave = async (newCfg: CQIEditorConfig) => {
    setCfg(newCfg);
    try {
      await upsertIqacCqiConfig({ options: Array.isArray(newCfg.options) ? newCfg.options : [], divider: newCfg.divider, multiplier: newCfg.multiplier });
      window.alert('CQI configuration saved.');
    } catch (e) {
      window.alert('Failed to save CQI configuration.');
    }
  };

  return (
    <div style={{ padding: 18 }}>
      <h3 style={{ marginTop: 0 }}>CQI Editor</h3>
      <div style={{ color: '#6b7280', marginBottom: 12 }}>Edit global CQI defaults for courses.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="obe-btn obe-btn-primary" onClick={() => setIsOpen(true)} disabled={loading}>{loading ? 'Loading…' : 'Open CQI Editor'}</button>
      </div>

      <CQIEditor
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSave={handleSave}
        currentSelection={cfg}
      />
    </div>
  );
}
