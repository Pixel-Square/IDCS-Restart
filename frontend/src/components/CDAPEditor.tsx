import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { defaultAnalysisMapping, normalizeAnalysisKey, analysisOptionLabels } from './activeLearningAnalysisMapping';
import {
  fetchCdapRevision,
  fetchGlobalAnalysisMapping,
  saveCdapRevision,
  subscribeToGlobalAnalysisMapping,
} from '../services/cdapDb';
import { ZoomIn, ZoomOut } from 'lucide-react';

type ColumnType = 'text' | 'checkbox';
type Col = { key: string; label: string; type: ColumnType; group?: 'po_pso' | 'key_deliverables' | 'assessments' };

const coreCols: Col[] = [
  { key: 'unit', label: 'UNIT', type: 'text' },
  { key: 'unit_name', label: 'SYLLABUS (UNIT NAME)', type: 'text' },
  { key: 'co', label: 'OUTCOME (WRITE THE CO)', type: 'text' },
  { key: 'content_type', label: 'Content type', type: 'text' },
  { key: 'part_no', label: 'PART NO.', type: 'text' },
  { key: 'topics', label: 'TOPICS TO BE COVERED (SYLLBUS TOPICS)', type: 'text' },
  { key: 'sub_topics', label: 'SUB TOPICS (WHAT TO BE TAUGHT)', type: 'text' },
  { key: 'bt_level', label: 'BT LEVEL', type: 'text' },
  // total_hours_required will be rendered after PSO3
];

const poCols: Col[] = Array.from({ length: 11 }, (_, i) => ({
  key: `po${i + 1}`,
  label: `PO${i + 1}`,
  type: 'checkbox' as const,
  group: 'po_pso' as const,
}));

const psoCols: Col[] = Array.from({ length: 3 }, (_, i) => ({
  key: `pso${i + 1}`,
  label: `PSO${i + 1}`,
  type: 'checkbox' as const,
  group: 'po_pso' as const,
}));

const activeLearningRowLabels = [
  'SSA1',
  'SSA2',
  'ACTIVE LEARNING 1 (SKILL)',
  'ACTIVE LEARNING 2 (SKILL)',
  'ACTIVE LEARNING 1 (ATTITUDE)',
  'ACTIVE LEARNING 2 (ATTITUDE)',
  'SPECIAL ACTIVITY',
] as const;

const activeLearningPoLabels = Array.from({ length: 11 }, (_, i) => `PO${i + 1}`);

const fallbackActiveLearningDropdownOptions: Record<(typeof activeLearningRowLabels)[number], string[]> = {
  SSA1: ['Technical magazine', 'Journal paper reading', 'Real time problems', 'Case study'],
  SSA2: ['Technical magazine', 'Journal paper reading', 'Real time problems', 'Case study'],
  'ACTIVE LEARNING 1 (SKILL)': [
    'Dipstick (Writing explanation content of CO)',
    'Dipstick (Sketch Representation)',
    'Real time Photography or Video Explanation',
    'Course competition',
  ],
  'ACTIVE LEARNING 2 (SKILL)': [
    'Dipstick (Writing explanation content of CO)',
    'Dipstick (Sketch Representation)',
    'Real time Photography or Video Explanation',
    'Course competition',
  ],
  'ACTIVE LEARNING 1 (ATTITUDE)': [
    'Active Learing Exercies (Group Discussion)',
    'Active Learing Exercies (Technical Question and answering Session)',
    'Technical Role play',
    'Interview Assessment',
  ],
  'ACTIVE LEARNING 2 (ATTITUDE)': [
    'Active Learing Exercies (Group Discussion)',
    'Active Learing Exercies (Technical Question and answering Session)',
    'Technical Role play',
    'Interview Assessment',
  ],
  'SPECIAL ACTIVITY': ['Active Projects', 'Journal Preparation'],
};

export default function CDAPEditor({
  subjectId,
  imported,
}: {
  subjectId?: string;
  imported?: {
    rows: Array<Record<string, any>>;
    textbook: string;
    reference: string;
    activeLearningOptionsByRow: string[][] | null;
    articulationExtras?: Record<string, any>;
  };
}) {
  const autofillDropdownsIfSingleOption = (optionsByRow: string[][], current: string[]) => {
    const next = [...current];
    for (let i = 0; i < optionsByRow.length; i++) {
      const opts = optionsByRow[i] ?? [];
      if ((!next[i] || String(next[i]).trim() === '') && Array.isArray(opts) && opts.length === 1) {
        next[i] = String(opts[0] ?? '').trim();
      }
    }
    return next;
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fitToScreen, setFitToScreen] = useState(true);
  const [tableZoom, setTableZoom] = useState(1);
  const [zoom, setZoom] = useState(() => {
    if (!subjectId) return 100;
    try {
      const stored = localStorage.getItem(`cdap_zoom_${subjectId}`);
      return stored ? parseInt(stored, 10) : 100;
    } catch {
      return 100;
    }
  });
  const [textbookDetails, setTextbookDetails] = useState('');
  const [referenceDetails, setReferenceDetails] = useState('');
  const [activeLearningGrid, setActiveLearningGrid] = useState<boolean[][]>(() =>
    activeLearningRowLabels.map(() => activeLearningPoLabels.map(() => false))
  );
  const [activeLearningDropdowns, setActiveLearningDropdowns] = useState<string[]>(() =>
    activeLearningRowLabels.map(() => '')
  );
  const [analysisMapping, setAnalysisMapping] = useState<Record<string, boolean[]>>(() => defaultAnalysisMapping());
  const [activeLearningDropdownOptionsByRow, setActiveLearningDropdownOptionsByRow] = useState<string[][]>(() =>
    activeLearningRowLabels.map((label) => fallbackActiveLearningDropdownOptions[label] ?? [])
  );
  const [articulationExtras, setArticulationExtras] = useState<Record<string, any>>({});
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  useEffect(() => {
    if (!subjectId) return;
    try {
      localStorage.setItem(
        `cdap_active_learning_draft_${subjectId}`,
        JSON.stringify({ dropdowns: activeLearningDropdowns, grid: activeLearningGrid, ts: Date.now() })
      );
      window.dispatchEvent(new CustomEvent('cdap-active-learning-changed', { detail: { subjectId } }));
    } catch {
      // ignore
    }
  }, [subjectId, activeLearningDropdowns, activeLearningGrid]);

  useEffect(() => {
    if (!subjectId) return;
    try {
      localStorage.setItem(`cdap_zoom_${subjectId}`, zoom.toString());
    } catch {
      // ignore
    }
  }, [subjectId, zoom]);

  const isNAContentType = (value: unknown) => {
    const s = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    return s.includes('#N/A');
  };

  const filterOutNARows = (list: Array<Record<string, any>>) =>
    list.filter((r) => !isNAContentType(r?.content_type));

  const allCols = useMemo(() => [...coreCols, ...poCols, ...psoCols], []);

  const emptyRow = useMemo(() => {
    const r: Record<string, any> = {};
    for (const c of allCols) {
      r[c.key] = c.type === 'checkbox' ? false : '';
    }
    return r;
  }, [allCols]);

  const [rows, setRows] = useState<Array<Record<string, any>>>(() => [structuredClone(emptyRow)]);

  const findAnalysisPoMapping = (sel: string): boolean[] | null => {
    const key = normalizeAnalysisKey(sel);
    if (key === normalizeAnalysisKey('SPECIAL ACTIVITY')) {
      const kp = normalizeAnalysisKey('Active Projects');
      if (Array.isArray(analysisMapping?.[kp]) && analysisMapping[kp].length === 11) return analysisMapping[kp];
    }
    if (Array.isArray(analysisMapping?.[key]) && analysisMapping[key].length === 11) return analysisMapping[key];
    for (const opt of analysisOptionLabels) {
      const k = normalizeAnalysisKey(opt);
      if (k === key && Array.isArray(analysisMapping?.[k]) && analysisMapping[k].length === 11) return analysisMapping[k];
    }
    for (const opt of analysisOptionLabels) {
      const k = normalizeAnalysisKey(opt);
      if ((k.includes(key) || key.includes(k)) && Array.isArray(analysisMapping?.[k]) && analysisMapping[k].length === 11) {
        return analysisMapping[k];
      }
    }
    return null;
  };

  const applyAnalysisMappingToGrid = (grid: boolean[][], dropdowns: string[]) => {
    const next = grid.map((row) => [...row]);
    for (let r = 0; r < activeLearningRowLabels.length; r++) {
      const sel = dropdowns?.[r] ?? '';
      if (!sel) continue;
      const po = findAnalysisPoMapping(sel);
      if (!Array.isArray(po) || po.length !== 11) continue;
      for (let c = 0; c < activeLearningPoLabels.length; c++) {
        next[r][c] = Boolean(po[c]);
      }
    }
    return next;
  };

  useEffect(() => {
    if (!subjectId) return;
    let mounted = true;

    const load = async () => {
      try {
        setCloudError(null);
        setLoadingCloud(true);
        const rev = await fetchCdapRevision(subjectId);
        if (!mounted) return;

        if (!rev) {
          setRows([structuredClone(emptyRow)]);
          setTextbookDetails('');
          setReferenceDetails('');
          setActiveLearningGrid(activeLearningRowLabels.map(() => activeLearningPoLabels.map(() => false)));
          setActiveLearningDropdowns(activeLearningRowLabels.map(() => ''));
          setActiveLearningDropdownOptionsByRow(
            activeLearningRowLabels.map((label) => fallbackActiveLearningDropdownOptions[label] ?? [])
          );
          return;
        }

        const nextRows = Array.isArray((rev as any).rows) ? (rev as any).rows : [];
        setRows(nextRows.length ? filterOutNARows(nextRows) : [structuredClone(emptyRow)]);

        const books = (rev as any).books && typeof (rev as any).books === 'object' ? (rev as any).books : {};
        setTextbookDetails(typeof books.textbook === 'string' ? books.textbook : '');
        setReferenceDetails(typeof books.reference === 'string' ? books.reference : '');

        const al =
          (rev as any).active_learning && typeof (rev as any).active_learning === 'object'
            ? (rev as any).active_learning
            : {};
        const dropdowns = Array.isArray(al.dropdowns)
          ? al.dropdowns.map((d: any) => (d == null ? '' : String(d)))
          : [];
        const grid = Array.isArray(al.grid) ? al.grid : [];
        const optionsByRow = Array.isArray(al.optionsByRow) ? al.optionsByRow : null;
        const extras = al.articulation_extras && typeof al.articulation_extras === 'object' ? al.articulation_extras : {};
        setArticulationExtras(extras);

        const nextGrid = activeLearningRowLabels.map((_, r) =>
          activeLearningPoLabels.map((__, c) => {
            const v = grid?.[r]?.[c];
            return v === true || v === 'true' || v === 1 || v === '1' || String(v).trim().toLowerCase() === 'x'
              ? true
              : Boolean(v);
          })
        );
        const nextDropdowns =
          dropdowns.length === activeLearningRowLabels.length
            ? dropdowns.slice(0, activeLearningRowLabels.length)
            : activeLearningRowLabels.map(() => '');

        const finalDropdowns = optionsByRow && Array.isArray(optionsByRow)
          ? autofillDropdownsIfSingleOption(optionsByRow as string[][], nextDropdowns)
          : nextDropdowns;

        setActiveLearningDropdowns(finalDropdowns);
        setActiveLearningGrid(applyAnalysisMappingToGrid(nextGrid, finalDropdowns));

        if (optionsByRow && Array.isArray(optionsByRow)) {
          const nextOpts = activeLearningRowLabels.map((_, idx) => {
            const rowOpts = optionsByRow?.[idx];
            if (Array.isArray(rowOpts)) {
              return rowOpts
                .map((v: any) => String(v ?? ''))
                .map((s: string) => s.trim())
                .filter(Boolean);
            }
            return [];
          });
          setActiveLearningDropdownOptionsByRow(nextOpts);
        } else {
          setActiveLearningDropdownOptionsByRow(
            activeLearningRowLabels.map((label) => fallbackActiveLearningDropdownOptions[label] ?? [])
          );
        }
      } catch (e: any) {
        if (!mounted) return;
        setCloudError(e?.message || 'Failed to load CDAP from cloud');
        setRows([structuredClone(emptyRow)]);
      } finally {
        if (mounted) setLoadingCloud(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [subjectId, emptyRow]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const next = await fetchGlobalAnalysisMapping();
        if (mounted) setAnalysisMapping(next);
      } catch {
        // ignore
      }
    };
    load();
    const unsub = subscribeToGlobalAnalysisMapping(() => load());
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!imported) return;
    if (Array.isArray(imported.rows) && imported.rows.length) setRows(filterOutNARows(imported.rows));
    if (typeof imported.textbook === 'string') setTextbookDetails(imported.textbook);
    if (typeof imported.reference === 'string') setReferenceDetails(imported.reference);
    if (Array.isArray(imported.activeLearningOptionsByRow) && imported.activeLearningOptionsByRow.length) {
      const nextOpts = activeLearningRowLabels.map((_, idx) => {
        const rowOpts = imported.activeLearningOptionsByRow?.[idx];
        if (Array.isArray(rowOpts)) {
          return rowOpts
            .map((v: any) => String(v ?? ''))
            .map((s: string) => s.trim())
            .filter(Boolean);
        }
        return [];
      });
      const currentDropdowns = activeLearningDropdowns;
      const finalDropdowns = autofillDropdownsIfSingleOption(nextOpts, currentDropdowns);
      setActiveLearningDropdownOptionsByRow(nextOpts);
      setActiveLearningDropdowns(finalDropdowns);
      setActiveLearningGrid((prev) => applyAnalysisMappingToGrid(prev, finalDropdowns));
    }

    if (imported.articulationExtras && typeof imported.articulationExtras === 'object') {
      setArticulationExtras(imported.articulationExtras);
    }
  }, [imported]);

  useEffect(() => {
    setActiveLearningGrid((prev) => applyAnalysisMappingToGrid(prev, activeLearningDropdowns));
  }, [analysisMapping]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, { key: string; items: Array<{ row: Record<string, any>; index: number }> }>();
    let carryUnitKey: string | null = null;
    rows.forEach((row, index) => {
      const rawUnit = row.unit ?? '';
      const normalized = rawUnit !== '' ? String(rawUnit) : '';
      if (normalized) carryUnitKey = normalized;

      const key = normalized || carryUnitKey || String(Math.floor(index / 9) + 1);
      const existing = groups.get(key) ?? { key, items: [] };
      existing.items.push({ row, index });
      groups.set(key, existing);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const an = Number(a.key);
      const bn = Number(b.key);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
      return a.key.localeCompare(b.key);
    });
  }, [rows]);

  const updateCell = (rowIdx: number, key: string, value: any) => {
    if (key === 'content_type' && isNAContentType(value)) {
      setRows((prev) => prev.filter((_, idx) => idx !== rowIdx));
      return;
    }
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [key]: value };
      return next;
    });
  };

  const addRow = () => setRows((p) => [...p, structuredClone(emptyRow)]);
  const removeRow = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));

  const addRowToGroup = (groupKey: string) => {
    setRows((prev) => {
      const newRow = structuredClone(emptyRow);
      newRow.unit = groupKey;

      let carryUnitKey: string | null = null;
      let lastIndex = -1;
      let firstIndexInGroup = -1;
      for (let i = 0; i < prev.length; i++) {
        const rawUnit = prev[i].unit ?? '';
        const normalized = rawUnit !== '' ? String(rawUnit) : '';
        if (normalized) carryUnitKey = normalized;
        const effectiveKey = normalized || carryUnitKey || String(Math.floor(i / 9) + 1);

        if (effectiveKey === String(groupKey)) {
          if (firstIndexInGroup === -1) firstIndexInGroup = i;
          lastIndex = i;
        }
      }

      if (firstIndexInGroup !== -1) {
        newRow.unit_name = prev[firstIndexInGroup].unit_name ?? '';
        newRow.co = prev[firstIndexInGroup].co ?? '';
      }

      if (lastIndex === -1) {
        return [...prev, newRow];
      }

      const next = [...prev.slice(0, lastIndex + 1), newRow, ...prev.slice(lastIndex + 1)];
      return next;
    });
  };

  const saveAll = async () => {
    if (!subjectId) {
      alert('No subject selected.');
      return;
    }
    try {
      setCloudError(null);
      setLoadingCloud(true);
      await saveCdapRevision({
        subjectId,
        status: 'published',
        rows,
        books: { textbook: textbookDetails, reference: referenceDetails },
        active_learning: {
          grid: activeLearningGrid,
          dropdowns: activeLearningDropdowns,
          optionsByRow: activeLearningDropdownOptionsByRow,
          articulation_extras: articulationExtras,
        },
      });
      alert('Saved to cloud.');
    } catch (e: any) {
      alert(e?.message || 'Failed to save to cloud');
    } finally {
      setLoadingCloud(false);
    }
  };

  useEffect(() => {
    if (!fitToScreen) {
      setTableZoom(1);
      return;
    }

    const computeZoom = () => {
      const container = containerRef.current;
      if (!container) return;
      const table = container.querySelector('table[data-cdap-table="1"]') as HTMLTableElement | null;
      if (!table) return;

      const containerWidth = container.clientWidth;
      const naturalWidth = table.scrollWidth;
      if (!containerWidth || !naturalWidth) return;

      const padding = 24;
      const raw = (containerWidth - padding) / naturalWidth;
      const next = Math.min(1, Math.max(0.35, raw));
      setTableZoom(next);
    };

    computeZoom();

    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => computeZoom());
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitToScreen, rows]);

  const topCoreCols = coreCols.slice(3, 8);
  const poPsoCols = [...poCols, ...psoCols];

  return (
    <div style={{
      border: '1px solid #dbe4f0',
      borderRadius: 14,
      padding: 18,
      background: '#fff',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
      width: '100%',
    }}>
      <style>{`
        .cdap-slider::-webkit-slider-thumb {
          appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .cdap-slider::-moz-range-thumb {
          height: 14px;
          width: 14px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          border: none;
        }
        .cdap-slider::-webkit-slider-track {
          background: #e5e7eb;
          height: 6px;
          border-radius: 999px;
        }
        .cdap-slider::-moz-range-track {
          background: #e5e7eb;
          height: 6px;
          border-radius: 999px;
          border: none;
        }
      `}</style>

      {loadingCloud ? (
        <div style={{ marginBottom: 8, fontSize: 12, color: '#64748b' }}>Loading from cloud…</div>
      ) : cloudError ? (
        <div style={{ marginBottom: 8, fontSize: 12, color: '#b91c1c' }}>{cloudError}</div>
      ) : null}

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        marginBottom: 16,
      }}>
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>Revised CDP Editor</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Interactive spreadsheet interface</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '6px 10px' }}>
            <ZoomOut size={16} color="#64748b" />
            <input
              type="range"
              min="50"
              max="200"
              step="10"
              value={zoom}
              onChange={(e) => setZoom(parseInt(e.target.value, 10))}
              className="cdap-slider"
              style={{ width: 110 }}
            />
            <ZoomIn size={16} color="#64748b" />
            <span style={{ fontSize: 12, color: '#334155', minWidth: 36 }}>{zoom}%</span>
          </div>
          <button
            onClick={() => setFitToScreen((v) => !v)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5f5',
              background: fitToScreen ? '#111827' : '#fff',
              color: fitToScreen ? '#fff' : '#111827',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            Fit Screen: {fitToScreen ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={addRow}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #059669',
              background: '#10b981',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            Add Row
          </button>
          <button
            onClick={saveAll}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #2563eb',
              background: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            Save All
          </button>
        </div>
      </div>

      <div ref={containerRef}>
        {groupedRows.map((group) => {
          const headerRow = group.items[0]?.row;
          if (!headerRow) return null;

          return (
            <div key={group.key} style={{
              border: '1px solid #dbe4f0',
              borderRadius: 14,
              padding: 16,
              background: '#fff',
              marginBottom: 16,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#1f2937', fontWeight: 600 }}>UNIT NUMBER</label>
                  <textarea
                    value={headerRow.unit ?? ''}
                    onChange={(e) => group.items.forEach((item) => updateCell(item.index, 'unit', e.target.value))}
                    style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 6, fontSize: 12 }}
                    rows={2}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#1f2937', fontWeight: 600 }}>SYLLABUS (UNIT NAME)</label>
                  <textarea
                    value={headerRow.unit_name ?? ''}
                    onChange={(e) => group.items.forEach((item) => updateCell(item.index, 'unit_name', e.target.value))}
                    style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 6, fontSize: 12 }}
                    rows={2}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#1f2937', fontWeight: 600 }}>COURSE OUTCOME (CO)</label>
                  <textarea
                    value={headerRow.co ?? ''}
                    onChange={(e) => group.items.forEach((item) => updateCell(item.index, 'co', e.target.value))}
                    style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 6, fontSize: 12 }}
                    rows={2}
                  />
                </div>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div
                  style={
                    fitToScreen
                      ? ({
                          transform: `scale(${tableZoom * (zoom / 100)})`,
                          transformOrigin: 'left top',
                          width: `${Math.max(1, 100 / (tableZoom * (zoom / 100)))}%`,
                        } as React.CSSProperties)
                      : ({
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'left top',
                          width: `${Math.max(1, 100 / (zoom / 100))}%`,
                        } as React.CSSProperties)
                  }
                >
                  <table data-cdap-table="1" style={{ borderCollapse: 'collapse', minWidth: 1000, width: '100%', fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #e2e8f0', padding: 6, background: '#f8fafc' }}>#</th>
                        {topCoreCols.map((c) => (
                          <th key={c.key} style={{ border: '1px solid #e2e8f0', padding: 6, background: '#f8fafc' }}>{c.label}</th>
                        ))}
                        {poPsoCols.map((c) => (
                          <th key={c.key} style={{ border: '1px solid #e2e8f0', padding: 6, background: '#fff7ed', textAlign: 'center' }}>{c.label}</th>
                        ))}
                        <th style={{ border: '1px solid #e2e8f0', padding: 6, background: '#f8fafc' }}>TOTAL HOURS REQUIRED</th>
                        <th style={{ border: '1px solid #e2e8f0', padding: 6, background: '#f8fafc' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, idx) => (
                        <Fragment key={item.index}>
                          <tr style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                            <td style={{ border: '1px solid #e2e8f0', padding: 6 }}>{idx + 1}</td>
                            {topCoreCols.map((c) => (
                              <td key={c.key} style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                                <textarea
                                  value={item.row[c.key] ?? ''}
                                  onChange={(e) => updateCell(item.index, c.key, e.target.value)}
                                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: 4, fontSize: 11 }}
                                  rows={2}
                                />
                              </td>
                            ))}
                            {poPsoCols.map((c) => (
                              <td key={c.key} style={{ border: '1px solid #e2e8f0', padding: 4, textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(item.row[c.key])}
                                  onChange={(e) => updateCell(item.index, c.key, e.target.checked)}
                                />
                              </td>
                            ))}
                            <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                              <input
                                type="text"
                                value={item.row.total_hours_required ?? ''}
                                onChange={(e) => updateCell(item.index, 'total_hours_required', e.target.value)}
                                style={{ width: 70, border: '1px solid #cbd5e1', borderRadius: 4, padding: 4, fontSize: 11 }}
                              />
                            </td>
                            <td style={{ border: '1px solid #e2e8f0', padding: 4, textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => removeRow(item.index)}
                                style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => addRowToGroup(group.key)}
                  style={{ padding: '8px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                >
                  Add Row to Unit {group.key}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
        <h4 style={{ marginBottom: 10 }}>Reference Materials</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Textbook Details</label>
            <textarea
              value={textbookDetails}
              onChange={(e) => setTextbookDetails(e.target.value)}
              rows={4}
              style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 6 }}
              placeholder="Textbook details (Excel: Column B, Row 64)"
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Reference Book Details</label>
            <textarea
              value={referenceDetails}
              onChange={(e) => setReferenceDetails(e.target.value)}
              rows={4}
              style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 6 }}
              placeholder="Reference book details (Excel: Column B, Row 68)"
            />
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h4 style={{ margin: 0 }}>Active Learning Mapping</h4>
            <div style={{ fontSize: 12, color: '#64748b' }}>7 × 11 PO mapping matrix</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveLearningGrid(activeLearningRowLabels.map(() => activeLearningPoLabels.map(() => false)));
              setActiveLearningDropdowns(activeLearningRowLabels.map(() => ''));
            }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}
          >
            Clear All
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 900, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #e2e8f0', padding: 8, background: '#f8fafc', textAlign: 'left' }}>Activity Type</th>
                <th style={{ border: '1px solid #e2e8f0', padding: 8, background: '#f8fafc', textAlign: 'left' }}>Specific Activity</th>
                {activeLearningPoLabels.map((po) => (
                  <th key={po} style={{ border: '1px solid #e2e8f0', padding: 8, background: '#fff7ed', textAlign: 'center' }}>{po}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeLearningRowLabels.map((rowLabel, r) => (
                <tr key={rowLabel} style={{ background: r % 2 === 0 ? '#fff' : '#f9fafb' }}>
                  <td style={{ border: '1px solid #e2e8f0', padding: 8, fontWeight: 600 }}>{rowLabel}</td>
                  <td style={{ border: '1px solid #e2e8f0', padding: 8 }}>
                    <select
                      value={activeLearningDropdowns[r] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setActiveLearningDropdowns((prev) => {
                          const next = [...prev];
                          next[r] = value;
                          return next;
                        });
                        setActiveLearningGrid((prev) => {
                          const next = prev.map((row) => [...row]);
                          const po = findAnalysisPoMapping(value);
                          if (Array.isArray(po) && po.length === 11) {
                            for (let c = 0; c < activeLearningPoLabels.length; c++) {
                              next[r][c] = Boolean(po[c]);
                            }
                          }
                          return next;
                        });
                      }}
                      style={{ width: '100%', padding: 6, border: '1px solid #cbd5e1', borderRadius: 6 }}
                    >
                      <option value="">-- Select Activity --</option>
                      {(() => {
                        const rawOpts = Array.isArray(activeLearningDropdownOptionsByRow?.[r]) && activeLearningDropdownOptionsByRow?.[r].length
                          ? activeLearningDropdownOptionsByRow?.[r]
                          : fallbackActiveLearningDropdownOptions[rowLabel] ?? [];
                        const cleaned = rawOpts
                          .map((o: any) => String(o ?? '').trim())
                          .filter(Boolean)
                          .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i);
                        return cleaned.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ));
                      })()}
                    </select>
                  </td>
                  {activeLearningPoLabels.map((po, c) => (
                    <td key={po} style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!activeLearningGrid[r][c]}
                        disabled={(() => {
                          const sel = activeLearningDropdowns?.[r] ?? '';
                          if (!sel) return false;
                          const mapped = findAnalysisPoMapping(sel);
                          return Array.isArray(mapped) && mapped.length === 11;
                        })()}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setActiveLearningGrid((prev) => {
                            const next = prev.map((row) => [...row]);
                            next[r][c] = checked;
                            return next;
                          });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}