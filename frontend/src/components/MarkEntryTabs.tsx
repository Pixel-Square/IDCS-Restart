import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import Cia1Entry from './Cia1Entry';
import Formative1List from './Formative1List';
import Ssa1Entry from './Ssa1Entry';
import { fetchMyTeachingAssignments, TeachingAssignmentItem } from '../services/obe';

type TabKey = 'dashboard' | 'ssa1' | 'formative1' | 'cia1' | 'ssa2' | 'cia2' | 'model';

type MarkRow = { studentId: string; mark: number };

type Props = {
  subjectId: string;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'ssa1', label: 'SSA1' },
  { key: 'formative1', label: 'Formative 1' },
  { key: 'cia1', label: 'CIA 1' },
  { key: 'ssa2', label: 'SSA2' },
  { key: 'cia2', label: 'CIA2' },
  { key: 'model', label: 'MODEL' },
];

function storageKey(subjectId: string, tab: TabKey) {
  return `marks_${subjectId}_${tab}`;
}

function downloadCsv(filename: string, rows: MarkRow[]) {
  const header = 'studentId,mark\n';
  const body = rows
    .map((r) => `${String(r.studentId || '').replace(/\n/g, ' ')},${Number(r.mark || 0)}`)
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`obe-sidebar-btn ${active ? 'active' : ''}`}
    >
      {label}
    </button>
  );
}

function MarkEntryTable({
  subjectId,
  tab,
}: {
  subjectId: string;
  tab: Exclude<TabKey, 'dashboard'>;
}) {
  const key = useMemo(() => storageKey(subjectId, tab), [subjectId, tab]);
  const [marks, setMarks] = useState<MarkRow[]>([]);

  useEffect(() => {
    const stored = lsGet<MarkRow[]>(key) || [];
    setMarks(Array.isArray(stored) ? stored : []);
  }, [key]);

  const addRow = () => setMarks((prev) => [...prev, { studentId: '', mark: 0 }]);

  const update = (i: number, field: keyof MarkRow, value: string | number) => {
    setMarks((prev) => {
      const copy = [...prev];
      const existing = copy[i] || { studentId: '', mark: 0 };
      copy[i] = { ...existing, [field]: value } as MarkRow;
      return copy;
    });
  };

  const removeRow = (i: number) => {
    setMarks((prev) => prev.filter((_, idx) => idx !== i));
  };

  const saveLocal = () => {
    lsSet(key, marks);
    alert('Marks saved locally.');
  };

  const exportCsv = () => {
    downloadCsv(`${subjectId}_${tab}_marks.csv`, marks);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={addRow} className="obe-btn obe-btn-primary">
          Add Row
        </button>
        <button onClick={saveLocal} className="obe-btn obe-btn-success">
          Save Local
        </button>
        <button
          onClick={exportCsv}
          className="obe-btn obe-btn-secondary"
          disabled={!marks.length}
          title={!marks.length ? 'Add at least one row to export' : 'Export as CSV'}
        >
          Export CSV
        </button>
      </div>

      {marks.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>
          No rows yet. Click “Add Row” to start.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {marks.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 90px',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <input
                value={m.studentId}
                onChange={(e) => update(i, 'studentId', e.target.value)}
                placeholder="Student ID"
                className="obe-input"
              />
              <input
                type="number"
                value={m.mark}
                onChange={(e) => update(i, 'mark', Number(e.target.value))}
                className="obe-input"
              />
              <button
                onClick={() => removeRow(i)}
                className="obe-btn obe-btn-danger"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
        Saved key: <span style={{ fontFamily: 'monospace' }}>{key}</span>
      </div>
    </div>
  );
}

export default function MarkEntryTabs({ subjectId }: Props) {
  const [active, setActive] = useState<TabKey>('dashboard');
  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [taError, setTaError] = useState<string | null>(null);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<TabKey>(`markEntry_activeTab_${subjectId}`);
    if (stored && TABS.some((t) => t.key === stored)) setActive(stored);
  }, [subjectId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await fetchMyTeachingAssignments();
        if (!mounted) return;
        const filtered = (all || []).filter((a) => a.subject_code === subjectId);
        setTas(filtered);
        setTaError(null);

        const stored = lsGet<number>(`markEntry_selectedTa_${subjectId}`);
        const initial =
          (typeof stored === 'number' && filtered.some((f) => f.id === stored) && stored) ||
          (filtered[0]?.id ?? null);
        setSelectedTaId(initial);
      } catch (e: any) {
        if (!mounted) return;
        setTas([]);
        setSelectedTaId(null);
        setTaError(e?.message || 'Failed to load teaching assignments');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  useEffect(() => {
    if (!subjectId) return;
    if (selectedTaId == null) return;
    lsSet(`markEntry_selectedTa_${subjectId}`, selectedTaId);
  }, [subjectId, selectedTaId]);

  useEffect(() => {
    if (!subjectId) return;
    lsSet(`markEntry_activeTab_${subjectId}`, active);
  }, [subjectId, active]);

  const counts = useMemo(() => {
    if (!subjectId) return {} as Record<TabKey, number>;
    const map: Partial<Record<TabKey, number>> = {};
    for (const t of TABS) {
      if (t.key === 'dashboard') continue;
      if (t.key === 'ssa1') {
        const ssa1 = lsGet<{ rows?: unknown }>(`ssa1_sheet_${subjectId}`);
        const ssa1Rows = (ssa1 as any)?.rows;
        map[t.key] = Array.isArray(ssa1Rows) ? ssa1Rows.length : 0;
        continue;
      }
      if (t.key === 'formative1') {
        const f1 = lsGet<{ rowsByStudentId?: unknown }>(`formative1_sheet_${subjectId}`);
        const rowsByStudentId = (f1 as any)?.rowsByStudentId;
        map[t.key] = rowsByStudentId && typeof rowsByStudentId === 'object' ? Object.keys(rowsByStudentId).length : 0;
        continue;
      }
      const rows = lsGet<MarkRow[]>(storageKey(subjectId, t.key)) || [];
      map[t.key] = Array.isArray(rows) ? rows.length : 0;
    }
    return map as Record<TabKey, number>;
  }, [subjectId, active]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 260 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Teaching Assignment (Section)</div>
          <select
            value={selectedTaId ?? ''}
            onChange={(e) => setSelectedTaId(e.target.value ? Number(e.target.value) : null)}
            className="obe-input"
            disabled={tas.length === 0}
          >
            {tas.length === 0 ? (
              <option value="">No teaching assignments</option>
            ) : (
              tas.map((ta) => (
                <option key={ta.id} value={ta.id}>
                  {ta.section_name} — {ta.academic_year}
                </option>
              ))
            )}
          </select>
          {taError && <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{taError}</div>}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
          Student rows load from the selected section roster.
        </div>
      </div>

      <div className="obe-sidebar-nav" aria-label="Mark Entry sub-tabs">
        {TABS.map((t) => (
          <TabButton key={t.key} active={active === t.key} label={t.label} onClick={() => setActive(t.key)} />
        ))}
      </div>

      {active === 'dashboard' && (
        <div>
          <h3 style={{ margin: '0 0 6px 0' }}>Dashboard</h3>
          <div style={{ color: '#6b7280', marginBottom: 12, fontSize: 14 }}>
            Quick overview for <b>{subjectId}</b>. Use the tabs to enter marks.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            {TABS.filter((t) => t.key !== 'dashboard').map((t) => (
              <div
                key={t.key}
                className="obe-card"
              >
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{t.label}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
                  Rows saved: {counts[t.key] ?? 0}
                </div>
                <button
                  onClick={() => setActive(t.key)}
                  className="obe-btn obe-btn-primary"
                  style={{ marginTop: 10 }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {active !== 'dashboard' && (
        <div>
          <h3 style={{ margin: '0 0 6px 0' }}>{TABS.find((t) => t.key === active)?.label}</h3>
          <div style={{ color: '#6b7280', marginBottom: 12, fontSize: 14 }}>
            {active === 'formative1' 
              ? 'Enter and manage Formative-1 assessment marks with BTL mapping.'
              : active === 'ssa1'
                ? 'SSA1 sheet-style entry (CO + BTL attainment) matching the Excel layout.'
              : active === 'cia1'
                ? 'CIA 1 sheet-style entry (Q-wise + CO + BTL) matching the Excel layout.' 
                : 'Enter and save marks locally for this assessment.'}
          </div>
          {active === 'formative1' ? (
            <Formative1List subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />
          ) : active === 'ssa1' ? (
            <Ssa1Entry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />
          ) : active === 'cia1' ? (
            <Cia1Entry subjectId={subjectId} />
          ) : (
            <MarkEntryTable subjectId={subjectId} tab={active as Exclude<TabKey, 'dashboard'>} />
          )}
        </div>
      )}
    </div>
  );
}
