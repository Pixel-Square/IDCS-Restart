import React, { useEffect, useMemo, useState } from 'react';

import { analysisOptionLabels, normalizeAnalysisKey } from '../components/activeLearningAnalysisMapping';
import { fetchGlobalAnalysisMapping, saveGlobalAnalysisMapping } from '../services/cdapDb';
import DashboardSidebar from '../components/DashboardSidebar';

type Mapping = Record<string, boolean[]>;

const poLabels = Array.from({ length: 11 }, (_, i) => `PO${i + 1}`);

function ensureRow(mapping: Mapping, label: string): boolean[] {
  const key = normalizeAnalysisKey(label);
  const existing = mapping?.[key];
  if (Array.isArray(existing) && existing.length === 11) return existing;
  return Array.from({ length: 11 }, () => false);
}

export default function OBEMasterPage(): JSX.Element {
  const [mapping, setMapping] = useState<Mapping>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchGlobalAnalysisMapping();
        if (mounted) setMapping(data || {});
      } catch (e: any) {
        if (mounted) setMessage(e?.message || 'Failed to load global mapping');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(
    () => analysisOptionLabels.map((label) => ({
      label,
      key: normalizeAnalysisKey(label),
      values: ensureRow(mapping, label),
    })),
    [mapping]
  );

  const updateCell = (label: string, idx: number, checked: boolean) => {
    const key = normalizeAnalysisKey(label);
    setMapping((prev) => {
      const current = Array.isArray(prev?.[key]) ? [...prev[key]] : Array.from({ length: 11 }, () => false);
      current[idx] = checked;
      return { ...prev, [key]: current };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveGlobalAnalysisMapping(mapping);
      setMessage('Saved global mapping.');
    } catch (e: any) {
      setMessage(e?.message || 'Failed to save global mapping');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="obe-master-page" style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
      <div style={{ display: 'flex', flexDirection: 'row', minHeight: '100vh' }}>
        <div style={{ flex: '0 0 240px', background: '#f8fafc', minHeight: '100vh', borderRight: '1px solid #eee' }}>
          <DashboardSidebar />
        </div>
        <div style={{ flex: 1, padding: '32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>OBE Master</h2>
            <div style={{ color: '#666', marginTop: 4 }}>Global PO mapping for Active Learning options</div>
          </div>

          {message && (
            <div style={{ marginBottom: 12, fontSize: 12, color: message.startsWith('Saved') ? '#166534' : '#b91c1c' }}>
              {message}
            </div>
          )}

          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #e5e7eb', padding: 10, textAlign: 'left', background: '#f8fafc' }}>Activity</th>
                  {poLabels.map((po) => (
                    <th key={po} style={{ borderBottom: '1px solid #e5e7eb', padding: 10, textAlign: 'center', background: '#fff7ed' }}>{po}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ borderTop: '1px solid #f1f5f9', padding: 10, fontWeight: 600 }}>{row.label}</td>
                    {row.values.map((val, i) => (
                      <td key={`${row.key}-${i}`} style={{ borderTop: '1px solid #f1f5f9', padding: 10, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => updateCell(row.label, i, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              {saving ? 'Saving...' : 'Save Global Mapping'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
