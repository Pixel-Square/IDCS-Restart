import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { defaultAnalysisMapping, normalizeAnalysisKey, analysisOptionLabels } from './activeLearningAnalysisMapping';
import {
  fetchCdapRevision,
  fetchGlobalAnalysisMapping,
  saveCdapRevision,
  subscribeToGlobalAnalysisMapping,
} from '../services/cdapDb';
import { createEditRequest, formatApiErrorMessage, formatEditRequestSentMessage } from '../services/obe';
import { useEditWindow } from '../hooks/useEditWindow';
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
  onLockChange,
}: {
  subjectId?: string;
  imported?: {
    rows: Array<Record<string, any>>;
    textbook: string;
    reference: string;
    activeLearningOptionsByRow: string[][] | null;
    articulationExtras?: Record<string, any>;
  };
  onLockChange?: (locked: boolean) => void;
}) {
  const teachingAssignmentId = useMemo(() => {
    if (!subjectId) return undefined;
    try {
      const raw = localStorage.getItem(`markEntry_selectedTa_${subjectId}`);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? (n as number) : undefined;
    } catch {
      return undefined;
    }
  }, [subjectId]);
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
  const [isLockedAfterSave, setIsLockedAfterSave] = useState(false);

  const {
    data: editWindow,
    loading: editWindowLoading,
    error: editWindowError,
    refresh: refreshEditWindow,
  } = useEditWindow({
    assessment: 'cdap',
    subjectCode: String(subjectId || ''),
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
    options: { poll: true },
  });

  const isPublishedByServer = Boolean(isLockedAfterSave);
  const hasEditApproval = Boolean(editWindow?.allowed_by_approval);
  const isReadOnly = Boolean(isPublishedByServer && !hasEditApproval);

  const [requestEditOpen, setRequestEditOpen] = useState(false);
  const [requestEditReason, setRequestEditReason] = useState('');
  const [requestEditBusy, setRequestEditBusy] = useState(false);
  const [requestEditError, setRequestEditError] = useState<string | null>(null);

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
        const rev = await fetchCdapRevision(subjectId, teachingAssignmentId);
        if (!mounted) return;

        const lockedByServer = String((rev as any)?.status || '').toLowerCase() === 'published';
        setIsLockedAfterSave(lockedByServer);
        if (lockedByServer) {
          setRequestEditOpen(false);
          setRequestEditError(null);
        }

        if (!rev) {
          setRows([structuredClone(emptyRow)]);
          setTextbookDetails('');
          setReferenceDetails('');
          setActiveLearningGrid(activeLearningRowLabels.map(() => activeLearningPoLabels.map(() => false)));
          setActiveLearningDropdowns(activeLearningRowLabels.map(() => ''));
          setActiveLearningDropdownOptionsByRow(
            activeLearningRowLabels.map((label) => fallbackActiveLearningDropdownOptions[label] ?? [])
          );
          setIsLockedAfterSave(false);
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
    onLockChange && onLockChange(Boolean(isReadOnly));
  }, [isReadOnly, onLockChange]);

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
    if (isReadOnly) return;
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
  }, [imported, isReadOnly]);

  const requestEdit = async () => {
    if (!subjectId) return;
    const reason = String(requestEditReason || '').trim();
    if (!reason) {
      setRequestEditError('Reason is required.');
      return;
    }

    setRequestEditBusy(true);
    setRequestEditError(null);
    try {
      const created = await createEditRequest({
        assessment: 'cdap',
        subject_code: subjectId,
        scope: 'MARK_ENTRY',
        reason,
        teaching_assignment_id: teachingAssignmentId,
      });
      alert(formatEditRequestSentMessage(created));
      setRequestEditOpen(false);
      // Stay on page; IQAC will review in their requests queue.
    } catch (e: any) {
      const msg = formatApiErrorMessage(e, 'Failed to request edit');
      setRequestEditError(msg);
      alert(`Edit request failed: ${msg}`);
    } finally {
      setRequestEditBusy(false);
      refreshEditWindow();
    }
  };

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
        teaching_assignment_id: teachingAssignmentId,
        rows,
        books: { textbook: textbookDetails, reference: referenceDetails },
        active_learning: {
          grid: activeLearningGrid,
          dropdowns: activeLearningDropdowns,
          optionsByRow: activeLearningDropdownOptionsByRow,
          articulation_extras: articulationExtras,
        },
      });
      setIsLockedAfterSave(true);
      alert('Published to cloud.');
    } catch (e: any) {
      alert(e?.message || 'Failed to save to cloud');
    } finally {
      setLoadingCloud(false);
      refreshEditWindow();
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
      padding: '16px 18px',
      background: '#fff',
      boxShadow: '0 2px 12px rgba(15, 23, 42, 0.08)',
      width: '100%',
      boxSizing: 'border-box',
      overflow: 'hidden',
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
        .cdap-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; }
        .cdap-table { border-collapse: collapse; width: 100%; font-size: 11px; table-layout: fixed; }
        .cdap-table thead th {
          position: sticky;
          top: 0;
          z-index: 2;
          border: 1px solid #e2e8f0;
          padding: 5px 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cdap-table tbody tr:hover td { background: #eff6ff !important; }
        .cdap-table tbody td { border: 1px solid #e2e8f0; padding: 3px 4px; vertical-align: top; }
        .cdap-cell-textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 3px 5px;
          font-size: 11px;
          resize: none;
          font-family: inherit;
          line-height: 1.4;
        }
        .cdap-cell-textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
        .cdap-cell-textarea:disabled { background: #f3f4f6; cursor: not-allowed; color: #6b7280; }
        .cdap-unit-card {
          border: 1px solid #dbe4f0;
          border-radius: 12px;
          background: #fff;
          margin-bottom: 14px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(15,23,42,0.05);
        }
        .cdap-unit-header {
          display: grid;
          grid-template-columns: 80px 1fr 1fr;
          gap: 0;
          border-bottom: 1px solid #dbe4f0;
          background: #f1f5f9;
        }
        .cdap-unit-header-cell {
          padding: 8px 10px;
          border-right: 1px solid #dbe4f0;
        }
        .cdap-unit-header-cell:last-child { border-right: none; }
        .cdap-unit-header-cell label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
          margin-bottom: 4px;
        }
        .cdap-unit-header-cell textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 4px 6px;
          font-size: 12px;
          font-family: inherit;
          resize: none;
          background: #fff;
          line-height: 1.4;
        }
        .cdap-unit-header-cell textarea:focus { outline: none; border-color: #2563eb; }
        .cdap-unit-header-cell textarea:disabled { background: #f3f4f6; cursor: not-allowed; color: #6b7280; }
        .cdap-table-scale-wrap {
          transform-origin: left top;
        }
      `}</style>

      {loadingCloud ? (
        <div style={{ marginBottom: 8, fontSize: 12, color: '#64748b' }}>Loading from cloud…</div>
      ) : cloudError ? (
        <div style={{ marginBottom: 8, fontSize: 12, color: '#b91c1c' }}>{cloudError}</div>
      ) : null}

      {isReadOnly ? (
        <div style={{
          marginBottom: 12,
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '1px solid #fbbf24',
          borderRadius: 10,
          color: '#92400e',
          fontSize: 14,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span>🔒 Published — Document is read-only. Use “Request Edit” to make changes.</span>
        </div>
      ) : null}

      {editWindowLoading || editWindowError ? (
        <div style={{ marginBottom: 10, fontSize: 12, color: editWindowError ? '#b91c1c' : '#64748b' }}>
          {editWindowError ? editWindowError : 'Checking edit approval…'}
        </div>
      ) : isPublishedByServer && hasEditApproval && editWindow?.approval_until ? (
        <div style={{ marginBottom: 10, fontSize: 12, color: '#065f46' }}>
          Edit approved until {new Date(editWindow.approval_until).toLocaleString()}.
        </div>
      ) : null}

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>Revised CDP Editor</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Interactive spreadsheet interface</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            >
              <ZoomOut size={14} color="#64748b" />
            </button>
            <input
              type="range"
              min="50"
              max="200"
              step="10"
              value={zoom}
              onChange={(e) => setZoom(parseInt(e.target.value, 10))}
              className="cdap-slider"
              style={{ width: 80 }}
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            >
              <ZoomIn size={14} color="#64748b" />
            </button>
            <span style={{ fontSize: 11, color: '#334155', minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
          </div>
          {/* Fit screen toggle */}
          <button
            onClick={() => setFitToScreen((v) => !v)}
            title="Toggle fit-to-screen scaling"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: fitToScreen ? 'none' : '1px solid #e2e8f0',
              background: fitToScreen ? '#111827' : '#fff',
              color: fitToScreen ? '#fff' : '#374151',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 5,
              boxShadow: fitToScreen ? '0 2px 6px rgba(17,24,39,0.25)' : '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all 150ms ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>
            Fit Screen: {fitToScreen ? 'ON' : 'OFF'}
          </button>
          {/* Add row */}
          <button
            onClick={addRow}
            disabled={isReadOnly}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              background: isReadOnly ? '#d1d5db' : '#059669',
              color: '#fff',
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 11,
              opacity: isReadOnly ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 5,
              boxShadow: isReadOnly ? 'none' : '0 2px 6px rgba(5,150,105,0.28)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Row
          </button>
          {/* Publish / Request Edit */}
          <button
            onClick={() => {
              if (!isReadOnly) return saveAll();
              setRequestEditOpen((v) => !v);
              setRequestEditError(null);
            }}
            disabled={requestEditBusy}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              background: isReadOnly ? '#16a34a' : '#2563eb',
              color: '#fff',
              cursor: requestEditBusy ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 11,
              opacity: requestEditBusy ? 0.6 : 1,
              boxShadow: isReadOnly
                ? '0 2px 6px rgba(22,163,74,0.28)'
                : '0 2px 6px rgba(37,99,235,0.28)',
            }}
          >
            {isReadOnly ? '✏️ Request Edit' : '🚀 Publish'}
          </button>
        </div>
      </div>

      {isReadOnly && requestEditOpen ? (
        <div style={{
          marginBottom: 16,
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 12,
          background: '#fff',
        }}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Reason (required)</div>
          <textarea
            value={requestEditReason}
            onChange={(e) => setRequestEditReason(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: 10,
              border: '1px solid #cbd5e1',
              borderRadius: 10,
              fontSize: 13,
              background: '#fff',
            }}
            placeholder="Why do you need to edit this published CDAP?"
          />
          {requestEditError ? (
            <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>{requestEditError}</div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              className="obe-btn"
              onClick={() => setRequestEditOpen(false)}
              disabled={requestEditBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="obe-btn obe-btn-success"
              onClick={requestEdit}
              disabled={requestEditBusy || !String(requestEditReason || '').trim()}
            >
              {requestEditBusy ? 'Requesting…' : 'Confirm Request'}
            </button>
          </div>
        </div>
      ) : null}

      <div ref={containerRef}>
        {groupedRows.map((group) => {
          const headerRow = group.items[0]?.row;
          if (!headerRow) return null;

          return (
            <div key={group.key} className="cdap-unit-card">
              {/* Compact unit header */}
              <div className="cdap-unit-header">
                <div className="cdap-unit-header-cell" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)' }}>
                  <label style={{ color: 'rgba(255,255,255,0.75)' }}>Unit #</label>
                  <textarea
                    value={headerRow.unit ?? ''}
                    onChange={(e) => group.items.forEach((item) => updateCell(item.index, 'unit', e.target.value))}
                    disabled={isReadOnly}
                    rows={2}
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, color: '#fff', padding: '4px 6px', fontSize: 13, fontWeight: 700, width: '100%', resize: 'none', fontFamily: 'inherit', cursor: isReadOnly ? 'not-allowed' : 'text' }}
                  />
                </div>
                <div className="cdap-unit-header-cell">
                  <label>Syllabus (Unit Name)</label>
                  <textarea
                    value={headerRow.unit_name ?? ''}
                    onChange={(e) => group.items.forEach((item) => updateCell(item.index, 'unit_name', e.target.value))}
                    disabled={isReadOnly}
                    rows={2}
                  />
                </div>
                <div className="cdap-unit-header-cell">
                  <label>Course Outcome (CO)</label>
                  <textarea
                    value={headerRow.co ?? ''}
                    onChange={(e) => group.items.forEach((item) => updateCell(item.index, 'co', e.target.value))}
                    disabled={isReadOnly}
                    rows={2}
                  />
                </div>
              </div>

              <div className="cdap-table-wrap" style={{ margin: '0 0' }}>
                {(() => {
                  const effectiveZoom = fitToScreen
                    ? tableZoom * (zoom / 100)
                    : zoom / 100;
                  const invZoom = Math.max(1, 100 / effectiveZoom);
                  return (
                    <div
                      className="cdap-table-scale-wrap"
                      style={{
                        transform: `scale(${effectiveZoom})`,
                        width: `${invZoom}%`,
                      } as React.CSSProperties}
                    >
                  <table data-cdap-table="1" className="cdap-table" style={{ minWidth: 1200 }}>
                    <colgroup>
                      <col style={{ width: 34 }} />{/* # */}
                      <col style={{ width: 90 }} />{/* content_type */}
                      <col style={{ width: 70 }} />{/* part_no */}
                      <col style={{ width: 190 }} />{/* topics */}
                      <col style={{ width: 190 }} />{/* sub_topics */}
                      <col style={{ width: 62 }} />{/* bt_level */}
                      {poPsoCols.map((c) => <col key={c.key} style={{ width: 34 }} />)}
                      <col style={{ width: 82 }} />{/* total_hours */}
                      <col style={{ width: 66 }} />{/* actions */}
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ background: '#f1f5f9', textAlign: 'center' }}>#</th>
                        {topCoreCols.map((c) => (
                          <th key={c.key} style={{ background: '#f1f5f9', textAlign: 'left' }}>{c.label}</th>
                        ))}
                        {poPsoCols.map((c) => (
                          <th key={c.key} style={{ background: c.key.startsWith('pso') ? '#fdf4ff' : '#fff7ed', textAlign: 'center' }}>{c.label}</th>
                        ))}
                        <th style={{ background: '#f0fdf4', textAlign: 'center' }}>HRS</th>
                        <th style={{ background: '#f1f5f9', textAlign: 'center' }}>Act.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, idx) => (
                        <Fragment key={item.index}>
                          <tr style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 600, fontSize: 10 }}>{idx + 1}</td>
                            {topCoreCols.map((c) => (
                              <td key={c.key}>
                                <textarea
                                  value={item.row[c.key] ?? ''}
                                  onChange={(e) => updateCell(item.index, c.key, e.target.value)}
                                  disabled={isReadOnly}
                                  className="cdap-cell-textarea"
                                  rows={2}
                                />
                              </td>
                            ))}
                            {poPsoCols.map((c) => (
                              <td key={c.key} style={{ textAlign: 'center', background: c.key.startsWith('pso') ? '#fdf4ff' : undefined }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(item.row[c.key])}
                                  onChange={(e) => updateCell(item.index, c.key, e.target.checked)}
                                  disabled={isReadOnly}
                                  style={{ cursor: isReadOnly ? 'not-allowed' : 'pointer', width: 14, height: 14, accentColor: '#2563eb' }}
                                />
                              </td>
                            ))}
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="text"
                                value={item.row.total_hours_required ?? ''}
                                onChange={(e) => updateCell(item.index, 'total_hours_required', e.target.value)}
                                disabled={isReadOnly}
                                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 4px', fontSize: 11, background: isReadOnly ? '#f3f4f6' : '#fff', cursor: isReadOnly ? 'not-allowed' : 'text', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => removeRow(item.index)}
                                disabled={isReadOnly}
                                title="Delete row"
                                style={{ padding: '3px 7px', background: isReadOnly ? '#d1d5db' : '#fee2e2', color: isReadOnly ? '#9ca3af' : '#dc2626', border: `1px solid ${isReadOnly ? '#d1d5db' : '#fca5a5'}`, borderRadius: 5, cursor: isReadOnly ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, opacity: isReadOnly ? 0.5 : 1 }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                    </div>
                  );
                })()}
              </div>

              <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => addRowToGroup(group.key)}
                  disabled={isReadOnly}
                  style={{ padding: '6px 12px', background: isReadOnly ? '#e5e7eb' : '#eff6ff', color: isReadOnly ? '#9ca3af' : '#2563eb', border: `1px solid ${isReadOnly ? '#d1d5db' : '#bfdbfe'}`, borderRadius: 7, cursor: isReadOnly ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12, opacity: isReadOnly ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add Row to Unit {group.key}
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
              disabled={isReadOnly}
              rows={4}
              style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 6, background: isReadOnly ? '#f3f4f6' : '#fff', cursor: isReadOnly ? 'not-allowed' : 'text' }}
              placeholder="Textbook details (Excel: Column B, Row 64)"
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Reference Book Details</label>
            <textarea
              value={referenceDetails}
              onChange={(e) => setReferenceDetails(e.target.value)}
              disabled={isReadOnly}
              rows={4}
              style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 6, background: isReadOnly ? '#f3f4f6' : '#fff', cursor: isReadOnly ? 'not-allowed' : 'text' }}
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
            disabled={isReadOnly}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: isReadOnly ? '#e5e7eb' : '#f8fafc', cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}
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
                      disabled={isReadOnly}
                      style={{ width: '100%', padding: 6, border: '1px solid #cbd5e1', borderRadius: 6, background: isReadOnly ? '#f3f4f6' : '#fff', cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
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
                        disabled={isReadOnly || (() => {
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
                        style={{ cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
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