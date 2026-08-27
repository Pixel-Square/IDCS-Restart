import React, { useEffect, useState, useMemo } from 'react';
import fetchWithAuth from '../../../../services/fetchAuth';
import { fetchArticulationMatrix } from '../../../../services/cdapDb';
import { fetchMyTeachingAssignments } from '../../../../services/obe';
import { ColumnDef } from './COattainmentTable';
import { getColumnAverage } from './coattainmentEngine';
import { RefreshCw, BookOpen, AlertCircle } from 'lucide-react';

type Props = {
  courseId?: string;
  data?: any;
  courseInfo?: any;
};

function roundHalfUp(value: number, decimals: number) {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export default function COAttainmentAnalysisPage({ courseId, data: propData, courseInfo }: Props) {
  const [fetchedData, setFetchedData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [matrixData, setMatrixData] = useState<any | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  const data = propData || fetchedData;
  const courseCode = courseInfo?.course_code || data?.course_code || '';
  const coCount = data?.co_count || 5;

  // 1. Fetch CO Summary data if not supplied
  useEffect(() => {
    if (propData || !courseId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-summary/`);
        if (!res.ok) throw new Error('Failed to fetch CO data');
        const d = await res.json();
        if (!cancelled) setFetchedData(d);
      } catch (e) {
        if (!cancelled) setFetchedData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, propData]);

  // 2. Fetch Articulation Matrix from CDAP
  const loadMatrix = async () => {
    if (!courseCode && !courseId) return;
    setMatrixLoading(true);
    setMatrixError(null);

    const subjectToUse = courseCode || courseId;

    try {
      let taId: number | undefined;
      try {
        const list = await fetchMyTeachingAssignments();
        const match = (list || []).find((a: any) => String(a?.subject_code) === String(subjectToUse));
        const idNum = match?.id != null ? Number(match.id) : NaN;
        if (Number.isFinite(idNum)) taId = idNum;
      } catch {}

      const res = await fetchArticulationMatrix(subjectToUse, taId);
      setMatrixData(res);
    } catch (e: any) {
      setMatrixError(e?.message || 'Articulation Matrix not available for this course yet.');
    } finally {
      setMatrixLoading(false);
    }
  };

  useEffect(() => {
    if (courseCode || courseId) {
      loadMatrix();
    }
  }, [courseCode, courseId]);

  // 3. Resolve configured columns and the selected CO-Avg column
  const { subColumns, coAvgColumnId, coAvgColumnLabel } = useMemo(() => {
    let map: Record<string, ColumnDef[]> = {};
    let coAvgMap: Record<string, string> = {};

    if (data?.class_type?.coattainment_layout && typeof data.class_type.coattainment_layout === 'object') {
      map = { ...map, ...data.class_type.coattainment_layout };
    }
    if ((data?.class_type as any)?.coattainment_co_avg_config && typeof (data.class_type as any).coattainment_co_avg_config === 'object') {
      coAvgMap = { ...coAvgMap, ...(data.class_type as any).coattainment_co_avg_config };
    }

    try {
      const rawMap = localStorage.getItem('coatt_columns_by_combination');
      if (rawMap) {
        const parsed = JSON.parse(rawMap);
        if (parsed && typeof parsed === 'object') map = { ...map, ...parsed };
      }
      const rawCoAvg = localStorage.getItem('coatt_co_avg_by_combination');
      if (rawCoAvg) {
        const parsed = JSON.parse(rawCoAvg);
        if (parsed && typeof parsed === 'object') coAvgMap = { ...coAvgMap, ...parsed };
      }
    } catch {}

    const classTypeId = data?.class_type?.id ?? data?.course?.class_type?.id ?? data?.course?.class_type_id ?? data?.class_type_id ?? '';
    const qpType = (typeof data?.qp_type === 'object' ? data.qp_type?.code || data.qp_type?.name : data?.qp_type) ?? data?.course?.question_paper_type ?? data?.course?.qp_type ?? data?.question_paper_type ?? '';

    const ctIds = [
      data?.class_type?.id,
      data?.class_type?.code,
      data?.class_type?.short_code,
      data?.class_type?.name,
      data?.course?.class_type?.id,
      data?.course?.class_type?.code,
      data?.course?.class_type?.short_code,
      data?.course?.class_type_id,
      data?.class_type_id,
    ].filter((x) => x !== undefined && x !== null && String(x).trim() !== '').map((x) => String(x).trim());

    const qpTypes = [
      typeof data?.qp_type === 'object' ? data.qp_type?.code || data.qp_type?.name : data?.qp_type,
      data?.course?.question_paper_type,
      data?.course?.qp_type,
      data?.question_paper_type,
    ].filter((x) => x !== undefined && x !== null && String(x).trim() !== '').map((x) => String(x).trim());

    let resolvedCols: ColumnDef[] = [];
    let resolvedCoAvgId = '';

    // Exact match check
    const comboKey = classTypeId && qpType ? `${classTypeId}::${qpType}` : `course:${courseId}`;
    if (Array.isArray(map[comboKey]) && map[comboKey].length > 0) {
      resolvedCols = map[comboKey];
      resolvedCoAvgId = coAvgMap[comboKey] || '';
    } else {
      outer: for (const ct of ctIds) {
        for (const qp of qpTypes) {
          const targetKey = `${ct}::${qp}`.toLowerCase();
          for (const k of Object.keys(map)) {
            if (k.toLowerCase() === targetKey && Array.isArray(map[k]) && map[k].length > 0) {
              resolvedCols = map[k];
              resolvedCoAvgId = coAvgMap[k] || coAvgMap[targetKey] || '';
              break outer;
            }
          }
        }
      }
    }

    if (resolvedCols.length === 0) {
      // Case-insensitive / partial match check
      const ctIdsLower = ctIds.map((x) => x.toLowerCase());
      const qpTypesLower = qpTypes.map((x) => x.toLowerCase());
      for (const k of Object.keys(map)) {
        if (!Array.isArray(map[k]) || map[k].length === 0) continue;
        const parts = k.split('::');
        if (parts.length === 2) {
          const [kCt, kQp] = parts.map((p) => p.toLowerCase());
          if (ctIdsLower.includes(kCt) || qpTypesLower.includes(kQp)) {
            resolvedCols = map[k];
            resolvedCoAvgId = coAvgMap[k] || '';
            break;
          }
        }
      }
    }

    // Check single ct match
    if (resolvedCols.length === 0) {
      const ctIdsLower = ctIds.map((x) => x.toLowerCase());
      for (const ct of ctIdsLower) {
        for (const k of Object.keys(map)) {
          if (!Array.isArray(map[k]) || map[k].length === 0) continue;
          if (k.toLowerCase().startsWith(`${ct}::`) || k.toLowerCase() === ct) {
            resolvedCols = map[k];
            resolvedCoAvgId = coAvgMap[k] || '';
            break;
          }
        }
      }
    }

    // Check single qp match
    if (resolvedCols.length === 0) {
      const qpTypesLower = qpTypes.map((x) => x.toLowerCase());
      for (const qp of qpTypesLower) {
        for (const k of Object.keys(map)) {
          if (!Array.isArray(map[k]) || map[k].length === 0) continue;
          if (k.toLowerCase().endsWith(`::${qp}`) || k.toLowerCase() === qp) {
            resolvedCols = map[k];
            resolvedCoAvgId = coAvgMap[k] || '';
            break;
          }
        }
      }
    }

    // 3. Fallback to saved coattainment snapshot if available
    if (resolvedCols.length === 0 && Array.isArray(data?.saved_coattainment?.columns_config) && data.saved_coattainment.columns_config.length > 0) {
      resolvedCols = data.saved_coattainment.columns_config;
    }

    // 4. Fallback to first available combination layout in map
    if (resolvedCols.length === 0) {
      const keysWithCols = Object.keys(map).filter((k) => Array.isArray(map[k]) && map[k].length > 0);
      if (keysWithCols.length > 0) {
        resolvedCols = map[keysWithCols[0]];
        resolvedCoAvgId = coAvgMap[keysWithCols[0]] || '';
      }
    }

    if (resolvedCols.length === 0) {
      resolvedCols = [
        { id: 'cia_50', label: 'CIA 50%', kind: 'formula', formula: '([COx-OBT-WEIGHT] / [COx-MAX-WEIGHT]) * 50' },
        { id: 'co_total', label: 'COx Total', kind: 'total' },
      ];
    }

    const hasTotal = resolvedCols.some((c) => c.kind === 'total' || c.id === 'co_total');
    if (!hasTotal) {
      resolvedCols = [...resolvedCols, { id: 'co_total', label: 'COx Total', kind: 'total' }];
    }

    // Check if coAvgMap has any entry across stored combinations if not matched
    if (!resolvedCoAvgId) {
      for (const k of Object.keys(coAvgMap)) {
        if (coAvgMap[k]) {
          const candidateId = coAvgMap[k];
          if (resolvedCols.some((c) => c.id === candidateId)) {
            resolvedCoAvgId = candidateId;
            break;
          }
        }
      }
    }

    // If still not matched, check if any column matches id '3pt' or has label containing '3pt'
    if (!resolvedCoAvgId) {
      const threePtCol = resolvedCols.find((c) => c.id === '3pt' || c.label.toLowerCase().includes('3pt'));
      if (threePtCol) {
        resolvedCoAvgId = threePtCol.id;
      }
    }

    // Default to the designated column or fall back to CO Total
    if (!resolvedCoAvgId) {
      const totalCol = resolvedCols.find((c) => c.kind === 'total' || c.id === 'co_total');
      resolvedCoAvgId = totalCol?.id || 'co_total';
    }

    const matchedCol = resolvedCols.find((c) => c.id === resolvedCoAvgId);
    const coAvgColumnLabel = matchedCol?.label || 'CO-Avg';

    return {
      subColumns: resolvedCols,
      coAvgColumnId: resolvedCoAvgId,
      coAvgColumnLabel,
    };
  }, [data, courseId]);

  // 4. Calculate exact column averages across all students for the designated CO-Avg column
  const coAverages = useMemo(() => {
    if (!data || !Array.isArray(data.students) || data.students.length === 0) {
      return {};
    }

    const result: Record<number, number | string> = {};
    const targetCol =
      subColumns.find((c) => c.id === coAvgColumnId) ||
      { id: coAvgColumnId, label: coAvgColumnLabel, kind: 'custom' };

    for (let co = 1; co <= coCount; co++) {
      result[co] = getColumnAverage(data, subColumns, targetCol, co);
    }

    return result;
  }, [data, coCount, subColumns, coAvgColumnId, coAvgColumnLabel]);

  // 5. Compute CO -> PO/PSO Summary Table with new CO Attainment column appended
  const { summaryHeaders, summaryRows } = useMemo(() => {
    const units = Array.isArray(matrixData?.units) ? matrixData.units : [];
    const courseDeliveryRows: Array<Array<any>> = [];
    const cols = 11 + 3; // 11 POs + 3 PSOs

    const buildRowForUnit = (unitIndex: number, label: string) => {
      const unit = units[unitIndex];
      if (!unit || !Array.isArray(unit.rows) || unit.rows.length === 0) {
        return [label, ...Array.from({ length: 11 }, () => ''), ...Array.from({ length: 3 }, () => ''), ''];
      }

      const rows = unit.rows;
      const sumHours = rows.reduce((acc, r) => {
        const h = Number(r.hours);
        return acc + (Number.isFinite(h) ? h : 0);
      }, 0);

      const poValues: Array<number | string> = [];
      for (let j = 0; j < 11; j++) {
        const colSum = rows.reduce((acc, r) => {
          const v = Number((r.po && r.po[j]) ?? 0);
          return acc + (Number.isFinite(v) ? v : 0);
        }, 0);
        if (sumHours > 0) {
          const raw = colSum / sumHours;
          const rounded = roundHalfUp(raw, 2);
          poValues.push(rounded.toFixed(2));
        } else {
          poValues.push('');
        }
      }

      const psoValues: Array<number | string> = [];
      for (let j = 0; j < 3; j++) {
        const colSum = rows.reduce((acc, r) => {
          const v = Number((r.pso && r.pso[j]) ?? 0);
          return acc + (Number.isFinite(v) ? v : 0);
        }, 0);
        if (sumHours > 0) {
          const raw = colSum / sumHours;
          const rounded = roundHalfUp(raw, 2);
          psoValues.push(rounded.toFixed(2));
        } else {
          psoValues.push('');
        }
      }

      return [label, ...poValues, ...psoValues, sumHours || ''];
    };

    for (let i = 0; i < coCount; i++) {
      courseDeliveryRows.push(buildRowForUnit(i, `CO${i + 1}`));
    }

    const dataRows: Array<Array<any>> = [];

    // Per-CO rows: multiply each PO/PSO by 3; if result is 0 -> keep as blank to show '-'
    courseDeliveryRows.forEach((r, idx) => {
      const coNum = idx + 1;
      const label = r[0];
      const poPso = r.slice(1, 1 + cols);
      const converted = poPso.map((v) => {
        if (v === '' || v === null || v === undefined) return '';
        const n = Number(String(v));
        if (!Number.isFinite(n)) return '';
        const mul = n * 3;
        const rounded = roundHalfUp(mul, 2);
        return rounded === 0 ? '' : rounded.toFixed(2);
      });

      const nums = converted.map((s) => (s === '' ? null : Number(s))).filter((n) => n !== null) as number[];
      const avg = nums.length ? roundHalfUp(nums.reduce((a, b) => a + b, 0) / nums.length, 2).toFixed(2) : '-';

      const coAttainmentVal = coAverages[coNum] !== undefined ? coAverages[coNum] : '-';

      dataRows.push([label, ...converted, avg, coAttainmentVal]);
    });

    // Column averages
    const colAverages: Array<any> = [];
    for (let c = 0; c < cols; c++) {
      const vals: number[] = [];
      for (let r = 0; r < dataRows.length; r++) {
        const v = dataRows[r][1 + c];
        if (v === '' || v === null || v === undefined || v === '-') continue;
        const n = Number(v);
        if (Number.isFinite(n)) vals.push(n);
      }
      if (vals.length) {
        colAverages.push(roundHalfUp(vals.reduce((a, b) => a + b, 0) / vals.length, 2).toFixed(2));
      } else {
        colAverages.push('-');
      }
    }

    // Row averages overall
    const rowAvgs = dataRows
      .map((r) => r[1 + cols])
      .filter((v) => v !== '' && v !== '-')
      .map(Number);
    const overallAvg = rowAvgs.length ? roundHalfUp(rowAvgs.reduce((a, b) => a + b, 0) / rowAvgs.length, 2).toFixed(2) : '-';

    // CO Attainment overall average
    const attainmentVals = dataRows
      .map((r) => r[r.length - 1])
      .filter((v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && v !== '-' && !isNaN(Number(v))))
      .map(Number);
    const overallAttainmentAvg = attainmentVals.length
      ? roundHalfUp(attainmentVals.reduce((a, b) => a + b, 0) / attainmentVals.length, 2).toFixed(2)
      : '-';

    dataRows.push(['Average', ...colAverages, overallAvg, overallAttainmentAvg]);

    const headers = [
      'COs',
      ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`),
      ...Array.from({ length: 3 }, (_, i) => `PSO${i + 1}`),
      'Average',
      'CO Attainment',
    ];

    return { summaryHeaders: headers, summaryRows: dataRows };
  }, [matrixData, coCount, coAverages]);

  // 6. Compute Second Table (Direct Attainment Matrix) using formula: (aboveCell / 3) * respective_CO_Attainment
  const { directAttainmentHeaders, directAttainmentRows } = useMemo(() => {
    if (!summaryRows || summaryRows.length === 0) {
      return { directAttainmentHeaders: [], directAttainmentRows: [] };
    }

    const cols = 11 + 3; // 11 POs + 3 PSOs
    const dataRows: Array<Array<any>> = [];

    // Filter out the bottom summary average row
    const coRows = summaryRows.slice(0, -1);

    coRows.forEach((r, idx) => {
      const label = r[0];
      const coNum = idx + 1;
      const coAttainmentRaw = r[r.length - 1];
      const coAttainmentNum = Number(coAttainmentRaw);
      const hasValidAttainment = Number.isFinite(coAttainmentNum) && coAttainmentRaw !== '-' && coAttainmentRaw !== '';

      const computedRow: Array<any> = [label];

      for (let c = 0; c < cols; c++) {
        const aboveValRaw = r[1 + c];
        if (
          aboveValRaw === '' ||
          aboveValRaw === null ||
          aboveValRaw === undefined ||
          aboveValRaw === '-'
        ) {
          computedRow.push('');
          continue;
        }

        const aboveValNum = Number(aboveValRaw);
        if (!Number.isFinite(aboveValNum)) {
          computedRow.push('');
          continue;
        }

        if (hasValidAttainment) {
          // Formula: (aboveCell / 3) * respective_CO_Attainment
          const calculated = (aboveValNum / 3) * coAttainmentNum;
          const rounded = roundHalfUp(calculated, 2);
          computedRow.push(rounded === 0 ? '' : rounded.toFixed(2));
        } else {
          computedRow.push('');
        }
      }

      dataRows.push(computedRow);
    });

    // Column Averages for the Direct Attainment Table
    const colAverages: Array<any> = [];
    for (let c = 0; c < cols; c++) {
      const vals: number[] = [];
      for (let r = 0; r < dataRows.length; r++) {
        const v = dataRows[r][1 + c];
        if (v === '' || v === null || v === undefined || v === '-') continue;
        const n = Number(v);
        if (Number.isFinite(n)) vals.push(n);
      }
      if (vals.length) {
        colAverages.push(roundHalfUp(vals.reduce((a, b) => a + b, 0) / vals.length, 2).toFixed(2));
      } else {
        colAverages.push('');
      }
    }

    dataRows.push(['Average', ...colAverages]);

    const headers = [
      'COs',
      ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`),
      ...Array.from({ length: 3 }, (_, i) => `PSO${i + 1}`),
    ];

    return { directAttainmentHeaders: headers, directAttainmentRows: dataRows };
  }, [summaryRows]);

  // 7. Compute Third Table (Final Attainment Matrix):
  // Row 1 "CO": (Table 2 Average / Table 1 Average) * 3
  // Row 2 "100%": ((CO value / 3) * 100)%
  const { finalAttainmentHeaders, finalAttainmentRows } = useMemo(() => {
    if (
      !summaryRows ||
      summaryRows.length === 0 ||
      !directAttainmentRows ||
      directAttainmentRows.length === 0
    ) {
      return { finalAttainmentHeaders: [], finalAttainmentRows: [] };
    }

    const cols = 11 + 3; // 11 POs + 3 PSOs
    const table1AvgRow = summaryRows[summaryRows.length - 1];
    const table2AvgRow = directAttainmentRows[directAttainmentRows.length - 1];

    const coRow: Array<any> = ['CO'];
    const percentRow: Array<any> = ['100%'];

    for (let c = 0; c < cols; c++) {
      const t1ValRaw = table1AvgRow?.[1 + c];
      const t2ValRaw = table2AvgRow?.[1 + c];

      const t1Num = Number(t1ValRaw);
      const t2Num = Number(t2ValRaw);

      if (
        Number.isFinite(t1Num) &&
        Number.isFinite(t2Num) &&
        t1Num > 0 &&
        t1ValRaw !== '' &&
        t1ValRaw !== '-' &&
        t2ValRaw !== '' &&
        t2ValRaw !== '-'
      ) {
        // Formula: (Table 2 Avg / Table 1 Avg) * 3
        const coVal = (t2Num / t1Num) * 3;
        const roundedCoVal = roundHalfUp(coVal, 2);
        coRow.push(roundedCoVal.toFixed(2));

        // 100% Formula: (CO / 3) * 100%
        const percentVal = Math.round((roundedCoVal / 3) * 100);
        percentRow.push(`${percentVal}%`);
      } else {
        coRow.push('');
        percentRow.push('');
      }
    }

    const headers = [
      '',
      ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`),
      ...Array.from({ length: 3 }, (_, i) => `PSO${i + 1}`),
    ];

    return {
      finalAttainmentHeaders: headers,
      finalAttainmentRows: [coRow, percentRow],
    };
  }, [summaryRows, directAttainmentRows]);

  return (
    <div className="bg-white rounded-lg border p-5 shadow-sm space-y-6">
      {/* Top Header & Context Information */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            CO Attainment Analysis — {courseCode} {courseInfo?.course_name || data?.course_name || ''}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Articulation Matrix with direct CO Attainment mapped from column:
            <span className="ml-1.5 px-2 py-0.5 bg-amber-100 text-amber-800 font-semibold rounded text-xs border border-amber-300">
              {coAvgColumnLabel}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadMatrix}
            disabled={matrixLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${matrixLoading ? 'animate-spin' : ''}`} />
            Refresh Matrix
          </button>
        </div>
      </div>

      {matrixLoading && (
        <div className="p-8 text-center text-gray-500 text-sm animate-pulse">
          Loading articulation matrix and CO attainment analysis…
        </div>
      )}

      {matrixError && !matrixLoading && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Notice:</span> {matrixError}
            <p className="mt-0.5 text-amber-700">Displaying CO Attainment values with available mappings.</p>
          </div>
        </div>
      )}

      {/* ─── Table 1: CO -> PO/PSO Summary Table ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-800">
            1. CO → PO/PSO Summary & CO Attainment Mapping
          </h4>
          <span className="text-xs text-gray-400">
            Units: {Array.isArray(matrixData?.units) ? matrixData.units.length : 0} · COs: {coCount}
          </span>
        </div>

        <div className="overflow-x-auto border rounded-xl shadow-xs">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100/90 text-gray-800 border-b border-gray-300">
                {summaryHeaders.map((h, i) => {
                  const isCoAttainment = h === 'CO Attainment';
                  const isAvg = h === 'Average';
                  return (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-center font-bold tracking-tight whitespace-nowrap border-r border-gray-200 last:border-r-0 ${
                        isCoAttainment
                          ? 'bg-amber-100/80 text-amber-950 font-extrabold border-l-2 border-l-amber-300'
                          : isAvg
                          ? 'bg-blue-50 text-blue-900 font-bold'
                          : i === 0
                          ? 'text-left bg-gray-100 font-bold sticky left-0'
                          : ''
                      }`}
                    >
                      {h}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row, rIdx) => {
                const isLastAverageRow = rIdx === summaryRows.length - 1;
                return (
                  <tr
                    key={`sum-row-${rIdx}`}
                    className={`border-b border-gray-200 transition-colors ${
                      isLastAverageRow
                        ? 'bg-yellow-100 font-bold text-gray-900 border-t-2 border-t-yellow-300'
                        : 'hover:bg-gray-50/70'
                    }`}
                  >
                    {row.map((val, cIdx) => {
                      const isCoAttainment = cIdx === row.length - 1;
                      const isRowAvg = cIdx === row.length - 2;
                      const displayVal = val === '' || val === null || val === undefined ? '-' : String(val);

                      return (
                        <td
                          key={`sum-cell-${rIdx}-${cIdx}`}
                          className={`px-3 py-2 text-center border-r border-gray-200 last:border-r-0 font-mono ${
                            cIdx === 0
                              ? `text-left font-semibold text-gray-800 sticky left-0 ${isLastAverageRow ? 'bg-yellow-100' : 'bg-white'} shadow-xs`
                              : ''
                          } ${
                            isLastAverageRow && !isCoAttainment && !isRowAvg
                              ? 'bg-yellow-100 font-bold'
                              : isCoAttainment
                              ? `${isLastAverageRow ? 'bg-amber-200/90' : 'bg-amber-50/90'} font-bold text-amber-950 border-l-2 border-l-amber-300 text-sm`
                              : isRowAvg
                              ? 'bg-blue-50/30 font-semibold text-blue-950'
                              : ''
                          }`}
                        >
                          {displayVal}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Table 2: Direct CO-PO/PSO Attainment Matrix ─── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-800">
              2. Direct CO → PO/PSO Attainment Matrix
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Calculated using formula: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-indigo-700 font-mono font-semibold">(Cell Value / 3) × CO Attainment</code>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border rounded-xl shadow-xs">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100/90 text-gray-800 border-b border-gray-300">
                {directAttainmentHeaders.map((h, i) => (
                  <th
                    key={`direct-h-${h}`}
                    className={`px-3 py-2.5 text-center font-bold tracking-tight whitespace-nowrap border-r border-gray-200 last:border-r-0 ${
                      i === 0 ? 'text-left bg-gray-100 font-bold sticky left-0' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {directAttainmentRows.map((row, rIdx) => {
                const isLastAverageRow = rIdx === directAttainmentRows.length - 1;
                return (
                  <tr
                    key={`direct-row-${rIdx}`}
                    className={`border-b border-gray-200 transition-colors ${
                      isLastAverageRow
                        ? 'bg-yellow-100 font-bold text-gray-900 border-t-2 border-t-yellow-300'
                        : 'hover:bg-gray-50/70'
                    }`}
                  >
                    {row.map((val, cIdx) => {
                      const displayVal = val === '' || val === null || val === undefined ? '-' : String(val);

                      return (
                        <td
                          key={`direct-cell-${rIdx}-${cIdx}`}
                          className={`px-3 py-2 text-center border-r border-gray-200 last:border-r-0 font-mono ${
                            cIdx === 0
                              ? `text-left font-semibold text-gray-800 sticky left-0 ${isLastAverageRow ? 'bg-yellow-100' : 'bg-white'} shadow-xs`
                              : isLastAverageRow
                              ? 'bg-yellow-100 font-bold text-gray-900'
                              : 'text-gray-900'
                          }`}
                        >
                          {displayVal}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Table 3: Final Attainment Matrix (CO & 100%) ─── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-800">
              3. Final Attainment Matrix (CO & 100%)
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Calculated as: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-indigo-700 font-mono font-semibold">CO = (Table 2 Average / Table 1 Average) × 3</code> · <code className="bg-gray-100 px-1.5 py-0.5 rounded text-indigo-700 font-mono font-semibold">100% = (CO / 3) × 100%</code>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border rounded-xl shadow-xs max-w-full">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100/90 text-gray-800 border-b border-gray-300">
                {finalAttainmentHeaders.map((h, i) => (
                  <th
                    key={`final-h-${i}`}
                    className={`px-3 py-2.5 text-center font-bold tracking-tight whitespace-nowrap border-r border-gray-200 last:border-r-0 ${
                      i === 0 ? 'text-left bg-gray-100 font-bold sticky left-0 w-20' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {finalAttainmentRows.map((row, rIdx) => {
                const isPercentRow = rIdx === 1;
                return (
                  <tr
                    key={`final-row-${rIdx}`}
                    className={`border-b border-gray-200 transition-colors ${
                      isPercentRow
                        ? 'bg-blue-50/50 font-bold text-blue-950'
                        : 'bg-white hover:bg-gray-50/70 font-semibold text-gray-900'
                    }`}
                  >
                    {row.map((val, cIdx) => {
                      const displayVal = val === '' || val === null || val === undefined ? '-' : String(val);

                      return (
                        <td
                          key={`final-cell-${rIdx}-${cIdx}`}
                          className={`px-3 py-2.5 text-center border-r border-gray-200 last:border-r-0 font-mono ${
                            cIdx === 0
                              ? `text-left font-bold uppercase tracking-wider sticky left-0 ${
                                  isPercentRow ? 'bg-blue-100/80 text-blue-900' : 'bg-gray-100 text-gray-800'
                                } shadow-xs`
                              : isPercentRow
                              ? 'font-bold text-blue-900'
                              : 'font-semibold text-gray-900'
                          }`}
                        >
                          {displayVal}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
