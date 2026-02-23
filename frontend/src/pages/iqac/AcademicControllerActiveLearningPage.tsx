import React, { useEffect, useState } from 'react';
import { normalizeAnalysisKey, analysisOptionLabels } from '../../components/activeLearningAnalysisMapping';
import { fetchGlobalAnalysisMapping, saveGlobalAnalysisMapping } from '../../services/cdapDb';

// 14 activity labels × 11 POs (PO1–PO11)
const PO_LABELS = Array.from({ length: 11 }, (_, i) => `PO${i + 1}`);

// mapping shape expected by the backend: { [normalizedActivityKey]: boolean[11] }
type GlobalMapping = Record<string, boolean[]>;

function emptyMapping(): GlobalMapping {
  const m: GlobalMapping = {};
  for (const label of analysisOptionLabels) {
    m[normalizeAnalysisKey(label)] = Array(PO_LABELS.length).fill(false);
  }
  return m;
}

export default function AcademicControllerActiveLearningPage(): JSX.Element {
  const [mapping, setMapping] = useState<GlobalMapping>(emptyMapping);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Load from backend on mount
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchGlobalAnalysisMapping()
      .then((data: GlobalMapping) => {
        if (!mounted) return;
        // Merge server data with the full template so all 14 activities always appear.
        setMapping((prev) => {
          const next = { ...prev };
          for (const label of analysisOptionLabels) {
            const k = normalizeAnalysisKey(label);
            const server = data?.[k];
            if (Array.isArray(server) && server.length === PO_LABELS.length) {
              next[k] = server;
            }
          }
          return next;
        });
      })
      .catch(() => {/* silently keep the empty default */})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  function togglePO(activityLabel: string, poIdx: number) {
    const k = normalizeAnalysisKey(activityLabel);
    setMapping((prev) => {
      const row = prev[k] ? [...prev[k]] : Array(PO_LABELS.length).fill(false);
      row[poIdx] = !row[poIdx];
      return { ...prev, [k]: row };
    });
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await saveGlobalAnalysisMapping(mapping);
      setMessage('✓ Saved — changes are now active for all courses.');
    } catch (e: any) {
      setMessage(`Save failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0 }}>Active Learning — PO Mapping (Global)</h3>
          <p style={{ color: '#6b7280', marginTop: 4, marginBottom: 0, fontSize: 13 }}>
            For each active-learning activity, tick which POs it contributes to. These settings apply to{' '}
            <strong>all courses</strong> immediately after saving.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            background: saving || loading ? '#d1fae5' : '#10b981',
            color: '#fff',
            border: 'none',
            fontWeight: 700,
            cursor: saving || loading ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {saving ? 'Saving…' : 'Save Global Mapping'}
        </button>
      </div>

      {message && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 6,
            background: message.startsWith('✓') ? '#ecfdf5' : '#fef2f2',
            color: message.startsWith('✓') ? '#065f46' : '#991b1b',
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6b7280', padding: 16 }}>Loading global mapping…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 700, width: '100%' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', border: '1px solid #e5e7eb', minWidth: 220 }}>
                  Active Learning Activity
                </th>
                {PO_LABELS.map((po) => (
                  <th key={po} style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'center', minWidth: 46 }}>
                    {po}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysisOptionLabels.map((label, rowIdx) => {
                const k = normalizeAnalysisKey(label);
                const row = mapping[k] ?? Array(PO_LABELS.length).fill(false);
                return (
                  <tr key={label} style={{ background: rowIdx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ padding: '7px 10px', border: '1px solid #e5e7eb', fontWeight: 500 }}>{label}</td>
                    {PO_LABELS.map((_, poIdx) => (
                      <td key={poIdx} style={{ padding: '4px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(row[poIdx])}
                          onChange={() => togglePO(label, poIdx)}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
