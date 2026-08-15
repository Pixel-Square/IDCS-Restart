import React, { useEffect, useMemo, useState, useRef } from 'react';
import fetchWithAuth from '../../../../services/fetchAuth';
import { Plus, X, Search, Calculator, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';

export type ColumnDef = {
  id: string;
  label: string;
  kind: 'raw' | 'weighted' | 'exam' | 'custom' | 'formula';
  formula?: string;
  meta?: any;
};

const STORAGE_KEY = 'coatt_columns_by_combination';

function loadStoredMap(): Record<string, ColumnDef[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function TokenPickerModal({
  open,
  exams,
  onClose,
  onSelectToken,
}: {
  open: boolean;
  exams: any[];
  onClose: () => void;
  onSelectToken: (token: string) => void;
}) {
  const [search, setSearch] = useState('');

  if (!open) return null;

  const getExamCode = (ex: any) => {
    const name = ex?.exam_display_name || ex?.exam_name || ex?.name || ex?.short_name || ex?.title || ex?.label || 'EXAM';
    return String(name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  };

  const categories = [
    {
      title: 'CO Aggregates Tokens',
      tokens: [
        { token: '[COx-TOTAL-RAW]', label: 'Total Raw Marks for COx across all exams' },
        { token: '[COx-TOTAL-WEIGHT]', label: 'Total Weighted Attainment for COx' },
        { token: '[COx-WEIGHTED]', label: 'Weighted Attainment for COx' },
      ],
    },
    {
      title: 'Exam Assignment CO Tokens',
      tokens: exams.flatMap((ex) => {
        const code = getExamCode(ex);
        const name = ex?.exam_display_name || ex?.name || code;
        return [
          { token: `[COx-${code}-RAW]`, label: `${name} — Raw Score for COx` },
          { token: `[COx-${code}-OBT]`, label: `${name} — Marks Obtained for COx` },
          { token: `[${code}-COx-RAW]`, label: `${name} — Raw Score for COx (Alias)` },
          { token: `[${code}-TOTAL]`, label: `${name} — Total Exam Score` },
        ];
      }),
    },
    {
      title: 'Math Operators & Factors',
      tokens: [
        { token: '+', label: 'Addition operator' },
        { token: '-', label: 'Subtraction operator' },
        { token: '*', label: 'Multiplication operator' },
        { token: '/', label: 'Division operator' },
        { token: '(', label: 'Left parenthesis' },
        { token: ')', label: 'Right parenthesis' },
        { token: '0.4', label: 'Weight factor (40%)' },
        { token: '0.6', label: 'Weight factor (60%)' },
      ],
    },
  ];

  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      tokens: cat.tokens.filter((t) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return t.token.toLowerCase().includes(q) || t.label.toLowerCase().includes(q);
      }),
    }))
    .filter((cat) => cat.tokens.length > 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="font-semibold text-gray-900 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-600" />
            <span>Select Variable Token</span>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search variable tokens..."
              className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {filteredCategories.map((cat, idx) => (
            <div key={idx} className="border rounded-lg p-3 bg-gray-50/50">
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">{cat.title}</div>
              <div className="space-y-1.5">
                {cat.tokens.map((t, tIdx) => (
                  <button
                    key={tIdx}
                    type="button"
                    onClick={() => {
                      onSelectToken(t.token);
                      onClose();
                    }}
                    className="w-full text-left px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition flex items-center justify-between group"
                  >
                    <code className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 group-hover:bg-blue-100">
                      {t.token}
                    </code>
                    <span className="text-xs text-gray-500 truncate ml-2">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredCategories.length === 0 && (
            <div className="text-center py-8 text-xs text-gray-400">No variable tokens found.</div>
          )}
        </div>

        <div className="pt-3 border-t flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-xs text-gray-600 hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CoFieldPickerPopup({
  open,
  courseId,
  selectedClassType,
  selectedQpType,
  classTypes,
  onClose,
  onAdd,
}: {
  open: boolean;
  courseId?: string;
  selectedClassType?: string;
  selectedQpType?: string;
  classTypes?: any[];
  onClose: () => void;
  onAdd: (items: ColumnDef[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState<any[]>([]);

  // Custom Formula Field State
  const [formulaTitle, setFormulaTitle] = useState('COx Custom Formula');
  const [formulaExpr, setFormulaExpr] = useState('');
  const [tokenModalOpen, setTokenModalOpen] = useState(false);

  const formulaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const classTypeMeta = classTypes?.find((ct: any) => String(ct.id) === String(selectedClassType));
    const filteredByCombination = (classTypeMeta?.exam_assignments || []).filter((ex: any) => {
      if (!selectedClassType || !selectedQpType) return true;
      const exQpType = String(ex.qp_type || ex.qpType || ex.type || '').trim();
      return exQpType === String(selectedQpType) || (!exQpType && !selectedQpType);
    });

    if (selectedClassType && selectedQpType && classTypeMeta) {
      setExams(filteredByCombination);
      setLoading(false);
      return;
    }

    if (!courseId) {
      setExams([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-summary/`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const filteredExams = Array.isArray(data.exams)
          ? data.exams.filter((ex: any) => {
              if (!selectedClassType || !selectedQpType) return true;
              const exQpType = String(ex.qp_type || ex.qpType || ex.type || '').trim();
              return exQpType === String(selectedQpType) || (!exQpType && !selectedQpType);
            })
          : [];
        setExams(filteredExams);
      } catch (e) {
        setExams([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, courseId, selectedClassType, selectedQpType, classTypes]);

  if (!open) return null;

  const insertTokenIntoFormula = (token: string) => {
    const input = formulaInputRef.current;
    if (!input) {
      setFormulaExpr((prev) => (prev ? `${prev} ${token}` : token));
      return;
    }

    const start = input.selectionStart ?? formulaExpr.length;
    const end = input.selectionEnd ?? formulaExpr.length;
    const newText = formulaExpr.substring(0, start) + (start > 0 && !formulaExpr[start - 1].endsWith(' ') ? ' ' : '') + token + ' ' + formulaExpr.substring(end);
    setFormulaExpr(newText);

    setTimeout(() => {
      input.focus();
      const newPos = start + token.length + 2;
      input.setSelectionRange(newPos, newPos);
    }, 50);
  };

  const handleAdd = () => {
    const newCols: ColumnDef[] = [];

    const title = formulaTitle.trim();
    const expr = formulaExpr.trim();

    if (title || expr) {
      newCols.push({
        id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: title || 'COx Custom Field',
        kind: expr ? 'formula' : 'custom',
        formula: expr,
      });
    }

    if (newCols.length > 0) {
      onAdd(newCols);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b flex items-center justify-between bg-gray-50">
          <div className="font-semibold text-gray-900">Add CO Attainment Fields</div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm transition"
            >
              Add Selected
            </button>
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">
              Close
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* Formula Field Section */}
          <div className="pt-2">
            <div className="mb-4">
              <label className="text-sm text-gray-700 font-semibold mb-1 block">Column Name / Title</label>
              <input
                type="text"
                value={formulaTitle}
                onChange={(e) => setFormulaTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                placeholder="e.g. COx Final Attainment"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-gray-700 font-semibold">Formula Expression</label>
                <button
                  type="button"
                  onClick={() => setTokenModalOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-semibold rounded transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Token Variables</span>
                </button>
              </div>
              <input
                ref={formulaInputRef}
                type="text"
                value={formulaExpr}
                onChange={(e) => setFormulaExpr(e.target.value)}
                placeholder="e.g. [COx-TOTAL-RAW] * 0.4 + [COx-TOTAL-WEIGHT] * 0.6"
                className="w-full px-3 py-2.5 border rounded-md text-sm font-mono bg-gray-50 focus:bg-white focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
              />
              <div className="text-xs text-gray-500 mt-2">
                Use token variables like <code className="text-purple-700 font-semibold bg-purple-50 px-1 py-0.5 rounded">[COx-TOTAL-RAW]</code> or click <span className="font-medium">+ Token Variables</span> to select.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nested Token Picker Modal */}
      {tokenModalOpen && (
        <TokenPickerModal
          open={tokenModalOpen}
          exams={exams}
          onClose={() => setTokenModalOpen(false)}
          onSelectToken={insertTokenIntoFormula}
        />
      )}
    </div>
  );
}

export default function CoAttainmentConfig({ courseId }: { courseId?: string }) {
  const [classTypes, setClassTypes] = useState<any[]>([]);
  const [qpTypes, setQpTypes] = useState<any[]>([]);
  const [selectedClassType, setSelectedClassType] = useState<string>('');
  const [selectedQpType, setSelectedQpType] = useState<string>('');
  const [columnMap, setColumnMap] = useState<Record<string, ColumnDef[]>>(() => loadStoredMap());
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnMap));
    if (selectedClassType && Object.keys(columnMap).length > 0) {
      fetchWithAuth(`/api/academic-v2/class-types/${selectedClassType}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coattainment_layout: columnMap }),
      }).catch((e) => console.error('Failed to sync coattainment_layout to backend', e));
    }
  }, [columnMap, selectedClassType]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [ctRes, qpRes] = await Promise.all([
          fetchWithAuth('/api/academic-v2/class-types/'),
          fetchWithAuth('/api/academic-v2/qp-types/'),
        ]);

        if (cancelled) return;

        if (ctRes.ok) {
          const ctData = await ctRes.json();
          const list = Array.isArray(ctData) ? ctData : ctData?.results || [];
          setClassTypes(list);

          // Populate columnMap with backend database layout configs
          setColumnMap((prev) => {
            const merged = { ...prev };
            list.forEach((ct: any) => {
              if (ct?.coattainment_layout && typeof ct.coattainment_layout === 'object') {
                Object.assign(merged, ct.coattainment_layout);
              }
            });
            return merged;
          });
        }

        if (qpRes.ok) {
          const qpData = await qpRes.json();
          setQpTypes(Array.isArray(qpData) ? qpData : qpData?.results || []);
        }
      } catch (error) {
        console.error('Failed to load class types / qp types', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!classTypes.length) return;
    if (!selectedClassType) {
      setSelectedClassType(String(classTypes[0].id));
    }
  }, [classTypes, selectedClassType]);

  const qpTypeOptions = useMemo(() => {
    if (!selectedClassType) return [] as Array<{ value: string; label: string }>;

    return qpTypes
      .filter((qp: any) => {
        if (qp.is_active === false) return false;
        const qpClassType = qp.class_type == null || qp.class_type === 'null' ? '' : String(qp.class_type);
        return qpClassType === String(selectedClassType) || !qpClassType;
      })
      .map((qp: any) => ({
        value: String(qp.code || qp.short_code || qp.name || ''),
        label: String(qp.name || qp.code || qp.short_code || ''),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [qpTypes, selectedClassType]);

  useEffect(() => {
    if (!selectedClassType) return;
    if (!selectedQpType || !qpTypeOptions.some((option) => option.value === selectedQpType)) {
      setSelectedQpType(qpTypeOptions[0]?.value || '');
    }
  }, [selectedClassType, selectedQpType, qpTypeOptions]);

  const activeKey = selectedClassType && selectedQpType ? `${selectedClassType}::${selectedQpType}` : null;
  const currentColumns = activeKey ? columnMap[activeKey] || [] : [];
  const selectedClassTypeMeta = classTypes.find((ct: any) => String(ct.id) === String(selectedClassType));
  const ctCode = selectedClassTypeMeta?.code || selectedClassTypeMeta?.short_code || selectedClassTypeMeta?.name || '';
  const altKey = ctCode && selectedQpType ? `${ctCode}::${selectedQpType}` : null;

  const onAddColumns = (items: ColumnDef[]) => {
    if (!activeKey || !items || items.length === 0) return;

    setColumnMap((prev) => {
      const existing = prev[activeKey] || (altKey ? prev[altKey] : []) || [];
      const updated = [...existing, ...items];
      const newMap = { ...prev, [activeKey]: updated };
      if (altKey) newMap[altKey] = updated;
      return newMap;
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    if (!activeKey) return;
    setColumnMap((prev) => {
      const existing = [...(prev[activeKey] || (altKey ? prev[altKey] : []) || [])];
      const target = idx + dir;
      if (target < 0 || target >= existing.length) return prev;
      const temp = existing[target];
      existing[target] = existing[idx];
      existing[idx] = temp;
      const newMap = { ...prev, [activeKey]: existing };
      if (altKey) newMap[altKey] = existing;
      return newMap;
    });
  };

  const removeColumn = (columnId: string) => {
    if (!activeKey) return;
    setColumnMap((prev) => {
      const existing = prev[activeKey] || (altKey ? prev[altKey] : []) || [];
      const updated = existing.filter((column) => column.id !== columnId);
      const newMap = { ...prev, [activeKey]: updated };
      if (altKey) newMap[altKey] = updated;
      return newMap;
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {/* Selection Sidebar */}
        <div className="col-span-1 bg-white rounded-lg border p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3 border-b pb-2">Layout Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Class Type</label>
              <select
                value={selectedClassType}
                onChange={(e) => setSelectedClassType(e.target.value || '')}
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-white"
              >
                <option value="">Select class type</option>
                {classTypes.map((ct: any) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name || ct.display_name || ct.short_code || ct.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">QP Type</label>
              {selectedClassType ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {qpTypeOptions.length === 0 ? (
                    <div className="text-xs text-gray-500">No QP types defined for this class type.</div>
                  ) : (
                    qpTypeOptions.map((qp) => (
                      <button
                        key={qp.value}
                        type="button"
                        onClick={() => setSelectedQpType(qp.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                          selectedQpType === qp.value
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {qp.label}
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-500">Choose a class type first.</div>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setPickerOpen(true)}
                disabled={!selectedClassType || !selectedQpType}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-sm transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Fields</span>
              </button>
            </div>
          </div>
        </div>

        {/* Configured Sub-Columns Display */}
        <div className="col-span-2 bg-white rounded-lg border p-4 shadow-sm">
          {!selectedClassType ? (
            <div className="text-sm text-gray-500 py-6 text-center">Select a class type to configure the CO attainment layout.</div>
          ) : !selectedQpType ? (
            <div className="text-sm text-gray-500 py-6 text-center">Select a QP type to show the saved configuration.</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 border-b pb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">Configured Sub-Columns (Per CO)</h3>
                  <p className="text-xs text-gray-500">
                    These columns will be rendered under each CO header (CO1, CO2, etc.) in the Faculty CO Attainment table.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                  {selectedClassTypeMeta?.display_name || selectedClassTypeMeta?.name || 'Class'} · {selectedQpType}
                </span>
              </div>

              {currentColumns.length === 0 ? (
                <div className="text-sm text-gray-500 py-8 text-center border border-dashed rounded-lg bg-gray-50/50">
                  No saved sub-columns configured yet. Click <strong>Add Fields</strong> to configure.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentColumns.map((c, idx) => (
                    <div key={c.id} className="flex items-center justify-between border rounded-lg p-3 bg-white shadow-xs">
                      <div className="space-y-0.5">
                        <div className="font-medium text-sm text-gray-900 flex items-center gap-2">
                          <span>{c.label}</span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                            c.kind === 'formula'
                              ? 'bg-purple-100 text-purple-700'
                              : c.kind === 'exam'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {c.kind}
                          </span>
                        </div>
                        {c.kind === 'formula' && c.formula && (
                          <div className="text-xs font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 inline-block">
                            Formula: {c.formula}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0}
                          className="p-1.5 border rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white"
                          title="Move Left"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => move(idx, 1)}
                          disabled={idx === currentColumns.length - 1}
                          className="p-1.5 border rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white"
                          title="Move Right"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeColumn(c.id)}
                          className="p-1.5 border rounded text-red-600 hover:bg-red-50 hover:border-red-200"
                          title="Delete Column"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-1.5">
                Auto-saved layout for <strong>{selectedClassTypeMeta?.name} · {selectedQpType}</strong>.
              </div>
            </>
          )}
        </div>
      </div>

      {pickerOpen && (
        <CoFieldPickerPopup
          open={pickerOpen}
          courseId={courseId}
          selectedClassType={selectedClassType}
          selectedQpType={selectedQpType}
          classTypes={classTypes}
          onClose={() => setPickerOpen(false)}
          onAdd={onAddColumns}
        />
      )}
    </div>
  );
}
