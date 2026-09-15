import React, { useEffect, useState, useMemo } from 'react';
import fetchWithAuth from '../../../../services/fetchAuth';
import { ColumnDef, evaluateFormulaExpr, computeStudentRowValues, getRawTotal, getWeightedTotal, getExamScore, getExamCoMaxMarks, getCoMaxWeight, getCalculatedAttainment } from './coattainmentEngine';

export type { ColumnDef };
export { evaluateFormulaExpr };

export default function COattainmentTable({
  courseId,
  data: propData,
}: {
  courseId?: string;
  data?: {
    course_code: string;
    course_name: string;
    co_count: number;
    total_internal_marks: number;
    class_type?: { id?: string; name?: string; code?: string; short_code?: string; coattainment_layout?: Record<string, ColumnDef[]> };
    qp_type?: any;
    exams: Array<{ id: string; name?: string; exam_display_name?: string; short_name?: string }>;
    students: Array<{
      student_id: string;
      reg_no: string;
      name: string;
      co_totals?: number[];
      exam_marks?: Record<string, Record<string, number>>;
    }>;
    course?: { class_type?: { id?: string; name?: string; code?: string; short_code?: string }; class_type_id?: string; question_paper_type?: string; qp_type?: string };
    class_type_id?: string;
    question_paper_type?: string;
  };
}) {
  const [fetchedData, setFetchedData] = useState<any | null>(null);
  const [fetching, setFetching] = useState(!propData && !!courseId);

  useEffect(() => {
    if (propData || !courseId) return;
    let cancelled = false;
    setFetching(true);
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-summary/`);
        if (!res.ok) throw new Error('Failed to fetch CO attainment');
        const resData = await res.json();
        if (!cancelled) setFetchedData(resData);
      } catch (e) {
        if (!cancelled) setFetchedData(null);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, propData]);

  const data = propData || fetchedData;
  const coCount = data?.co_count || 5;

  const storedColumns: ColumnDef[] = useMemo(() => {
    if (!data) return [];
    try {
      let map: Record<string, ColumnDef[]> = {};

      // 1. Load from DB class_type layout first
      if (data.class_type?.coattainment_layout && typeof data.class_type.coattainment_layout === 'object') {
        map = { ...map, ...data.class_type.coattainment_layout };
      }

      // 2. Merge with localStorage combinations
      const rawMap = localStorage.getItem('coatt_columns_by_combination');
      if (rawMap) {
        try {
          const parsed = JSON.parse(rawMap);
          if (parsed && typeof parsed === 'object') map = { ...map, ...parsed };
        } catch {}
      }

      const classTypeId = data.class_type?.id ?? data.course?.class_type?.id ?? data.course?.class_type_id ?? data.class_type_id ?? '';
      const qpType = (typeof data.qp_type === 'object' ? data.qp_type?.code || data.qp_type?.name : data.qp_type) ?? data.course?.question_paper_type ?? data.course?.qp_type ?? data.question_paper_type ?? '';

      const ctIds = [
        data.class_type?.id,
        data.class_type?.code,
        data.class_type?.short_code,
        data.class_type?.name,
        data.course?.class_type?.id,
        data.course?.class_type?.code,
        data.course?.class_type?.short_code,
        data.course?.class_type_id,
        data.class_type_id,
      ].filter((x) => x !== undefined && x !== null && String(x).trim() !== '').map((x) => String(x).trim());

      const qpTypes = [
        typeof data.qp_type === 'object' ? data.qp_type?.code || data.qp_type?.name : data.qp_type,
        data.course?.question_paper_type,
        data.course?.qp_type,
        data.question_paper_type,
      ].filter((x) => x !== undefined && x !== null && String(x).trim() !== '').map((x) => String(x).trim());

      // Exact match check
      const comboKey = classTypeId && qpType ? `${classTypeId}::${qpType}` : `course:${courseId}`;
      if (Array.isArray(map[comboKey]) && map[comboKey].length > 0) return map[comboKey];

      for (const ct of ctIds) {
        for (const qp of qpTypes) {
          const targetKey = `${ct}::${qp}`.toLowerCase();
          for (const k of Object.keys(map)) {
            if (k.toLowerCase() === targetKey && Array.isArray(map[k]) && map[k].length > 0) {
              return map[k];
            }
          }
        }
      }

      // Case-insensitive / partial match check
      const ctIdsLower = ctIds.map((x) => x.toLowerCase());
      const qpTypesLower = qpTypes.map((x) => x.toLowerCase());
      for (const k of Object.keys(map)) {
        if (!Array.isArray(map[k]) || map[k].length === 0) continue;
        const parts = k.split('::');
        if (parts.length === 2) {
          const [kCt, kQp] = parts.map((p) => p.toLowerCase());
          if (ctIdsLower.includes(kCt) || qpTypesLower.includes(kQp)) {
            return map[k];
          }
        }
      }

      // Check single ct match
      for (const ct of ctIdsLower) {
        for (const k of Object.keys(map)) {
          if (!Array.isArray(map[k]) || map[k].length === 0) continue;
          if (k.toLowerCase().startsWith(`${ct}::`) || k.toLowerCase() === ct) {
            return map[k];
          }
        }
      }

      // Check single qp match
      for (const qp of qpTypesLower) {
        for (const k of Object.keys(map)) {
          if (!Array.isArray(map[k]) || map[k].length === 0) continue;
          if (k.toLowerCase().endsWith(`::${qp}`) || k.toLowerCase() === qp) {
            return map[k];
          }
        }
      }

      // 3. Fallback to saved coattainment snapshot if available
      if (Array.isArray(data.saved_coattainment?.columns_config) && data.saved_coattainment.columns_config.length > 0) {
        return data.saved_coattainment.columns_config;
      }

      // 4. Fallback to first available combination layout in map
      const keysWithColumns = Object.keys(map).filter((k) => Array.isArray(map[k]) && map[k].length > 0);
      if (keysWithColumns.length > 0) {
        return map[keysWithColumns[0]];
      }

      return [];
    } catch {
      return [];
    }
  }, [data, courseId]);

  const subColumns: ColumnDef[] = useMemo(() => {
    if (storedColumns.length === 0) {
      return [
        { id: 'cia_50', label: 'CIA 50%', kind: 'formula', formula: '([COx-OBT-WEIGHT] / [COx-MAX-WEIGHT]) * 50' },
        { id: 'co_total', label: 'COx Total', kind: 'total' },
      ];
    }
    const hasTotal = storedColumns.some((c) => c.kind === 'total' || c.id === 'co_total');
    if (!hasTotal) {
      return [...storedColumns, { id: 'co_total', label: 'COx Total', kind: 'total' }];
    }
    return storedColumns;
  }, [storedColumns]);

  const formatSubColumnTitle = (label: string, coNum: number) => {
    const str = label || `CO${coNum}`;
    return str.replace(/\bCOx\b/gi, `CO${coNum}`).replace(/\bCOX\b/g, `CO${coNum}`);
  };

  const coNumbers = useMemo(() => Array.from({ length: coCount }, (_, i) => i + 1), [coCount]);

  // Cache precalculated values for all students per CO to render instantly
  const precalculatedAttainment = useMemo(() => {
    if (!data || !Array.isArray(data.students)) return {};
    const map: Record<string, Record<string, Record<string, number | '-'>>> = {};

    data.students.forEach((s: any) => {
      const sId = String(s.student_id || s.reg_no || '');
      if (!sId) return;
      map[sId] = {};
      coNumbers.forEach((co) => {
        const coKey = `co${co}`;
        map[sId][coKey] = computeStudentRowValues(data, subColumns, s, co);
      });
    });

    return map;
  }, [data, subColumns, coNumbers]);

  const getCellValue = (student: any, col: ColumnDef, coNum: number): number | '-' => {
    const sId = String(student?.student_id || student?.reg_no || '');
    const coKey = `co${coNum}`;
    const cached = precalculatedAttainment[sId]?.[coKey]?.[col.id];
    if (cached !== undefined) return cached;
    return computeStudentRowValues(data, subColumns, student, coNum)[col.id] ?? '-';
  };

  const getCoTotalValue = (student: any, coNum: number): number | '-' => {
    const totalCol = subColumns.find((c) => c.kind === 'total' || c.id === 'co_total');
    const colId = totalCol?.id || 'co_total';
    return getCellValue(student, { id: colId, label: 'COx Total', kind: 'total' }, coNum);
  };

  const getColumnAverage = (col: ColumnDef, coNum: number): number | '-' => {
    if (!Array.isArray(data?.students) || data.students.length === 0) return '-';
    let sum = 0;
    let count = 0;
    data.students.forEach((s: any) => {
      let val: any = null;
      if (col.kind === 'total' || col.id === 'co_total') {
        val = getCoTotalValue(s, coNum);
      } else {
        val = getCellValue(s, col, coNum);
      }
      if (typeof val === 'number' && !isNaN(val)) {
        sum += val;
        count += 1;
      }
    });
    if (count === 0) return '-';
    const avg = sum / count;
    return Number.isInteger(avg) ? avg : Number(avg.toFixed(2));
  };

  const hasAnyAvg = useMemo(() => subColumns.some((col) => col.show_avg), [subColumns]);

  const lastSyncedKeyRef = React.useRef<string>('');

  useEffect(() => {
    if (!courseId || !data || !Array.isArray(data.students) || data.students.length === 0) return;

    const columnAveragesMap: Record<string, Record<string, number | '-'>> = {};
    coNumbers.forEach((co) => {
      columnAveragesMap[String(co)] = {};
      subColumns.forEach((col) => {
        if (col.show_avg) {
          columnAveragesMap[String(co)][col.id] = getColumnAverage(col, co);
        }
      });
    });

    const studentValuesMap: Record<string, Record<string, any>> = {};
    data.students.forEach((s: any) => {
      const sId = String(s.student_id || s.reg_no || '');
      if (!sId) return;
      studentValuesMap[sId] = {};
      coNumbers.forEach((co) => {
        const coKey = `co${co}`;
        studentValuesMap[sId][coKey] = {};
        subColumns.forEach((col) => {
          studentValuesMap[sId][coKey][col.id] =
            col.kind === 'total' || col.id === 'co_total'
              ? getCoTotalValue(s, co)
              : getCellValue(s, col, co);
        });
      });
    });

    const payload = {
      co_numbers: coNumbers,
      columns_config: subColumns,
      column_averages: columnAveragesMap,
      student_values: studentValuesMap,
    };

    const syncKey = `${courseId}_${JSON.stringify(subColumns)}_${data.students.length}`;
    if (lastSyncedKeyRef.current === syncKey) return;
    lastSyncedKeyRef.current = syncKey;

    const timer = setTimeout(() => {
      fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-attainment/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => console.error('Failed to sync CO attainment to database', err));
    }, 1000);

    return () => clearTimeout(timer);
  }, [courseId, subColumns, data?.students?.length, coNumbers]);

  if (fetching && !data) {
    return <div className="p-6 text-sm text-gray-500">Loading CO attainment table…</div>;
  }

  if (!data) {
    return <div className="p-6 text-sm text-gray-400">No CO attainment data available.</div>;
  }

  return (
    <div className="bg-white rounded-lg border p-4 shadow-sm overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">
            CO Attainment — {data.course_code} {data.course_name}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Configured Layout: {subColumns.length > 0 ? `${subColumns.length} sub-column(s) configured` : 'No sub-columns configured'}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg max-h-[calc(100vh-220px)] overflow-y-auto">
        <table className="min-w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-gray-100 shadow-sm">
            <tr className="bg-gray-100 text-gray-800">
              <th rowSpan={2} className="border px-3 py-2 text-left font-semibold w-28 sticky left-0 top-0 bg-gray-100 z-30 border-b border-gray-300">
                Reg No
              </th>
              <th rowSpan={2} className="border px-3 py-2 text-left font-semibold w-40 sticky top-0 bg-gray-100 z-20 border-b border-gray-300">
                Student Name
              </th>
              {coNumbers.map((co) => (
                <th
                  key={`co-header-${co}`}
                  colSpan={Math.max(1, subColumns.length)}
                  className="border px-3 py-1.5 text-center font-bold text-sm bg-blue-50 text-blue-900 border-blue-200 sticky top-0 border-b border-gray-300"
                >
                  CO{co}
                </th>
              ))}
            </tr>

            <tr className="bg-gray-50 text-gray-700">
              {coNumbers.flatMap((co) =>
                subColumns.length > 0 ? (
                  subColumns.map((col) => (
                    <th
                      key={`co-${co}-col-${col.id}`}
                      className={`border px-2 py-1.5 text-center truncate sticky top-[34px] z-20 border-b border-gray-300 ${
                        col.kind === 'total' || col.id === 'co_total'
                          ? 'font-bold min-w-[100px] max-w-[140px] bg-amber-100/90 text-amber-950 border-amber-300'
                          : 'font-medium min-w-[110px] max-w-[160px] bg-gray-50'
                      }`}
                      title={formatSubColumnTitle(col.label, co)}
                    >
                      <div className="truncate font-bold">{formatSubColumnTitle(col.label, co)}</div>
                      <div className="text-[10px] font-mono truncate">
                        {col.kind === 'formula' ? (
                          <span className="text-purple-600 font-normal">formula</span>
                        ) : col.kind === 'total' || col.id === 'co_total' ? (
                          <span className="text-amber-700 font-semibold">total</span>
                        ) : null}
                      </div>
                    </th>
                  ))
                ) : (
                  <th key={`co-${co}-empty`} className="border px-2 py-1.5 text-center font-normal italic text-gray-400 sticky top-[34px] z-20 bg-gray-50 border-b border-gray-300">
                    No columns
                  </th>
                )
              )}
            </tr>

            {/* Header row 3: Class Average row directly below column titles */}
            {hasAnyAvg && (
              <tr className="bg-emerald-50/95 text-emerald-950 font-bold border-b-2 border-emerald-300">
                <th className="border px-3 py-2 text-left font-mono font-bold sticky left-0 top-[68px] bg-emerald-100 z-30 text-emerald-900 border-b border-emerald-300">
                  Avg
                </th>
                <th className="border px-3 py-2 text-left font-bold sticky top-[68px] bg-emerald-100/95 z-20 text-emerald-900 truncate max-w-[180px] border-b border-emerald-300">
                  Class Average
                </th>
                {coNumbers.flatMap((co) =>
                  subColumns.length > 0 ? (
                    subColumns.map((col) => {
                      if (!col.show_avg) {
                        return (
                          <th
                            key={`avg-${co}-${col.id}`}
                            className="border px-2 py-2 text-center font-mono text-gray-300 bg-emerald-50/40 sticky top-[68px] z-20 border-b border-emerald-300 font-normal"
                          >
                            -
                          </th>
                        );
                      }
                      const avgVal = getColumnAverage(col, co);
                      return (
                        <th
                          key={`avg-${co}-${col.id}`}
                          className={`border px-2 py-2 text-center font-mono font-bold text-xs sticky top-[68px] z-20 border-b ${
                            col.kind === 'total' || col.id === 'co_total'
                              ? 'bg-amber-100 text-amber-950 border-amber-300'
                              : 'bg-emerald-100/90 text-emerald-950 border-emerald-300'
                          }`}
                        >
                          {avgVal}
                        </th>
                      );
                    })
                  ) : (
                    <th key={`avg-${co}-empty`} className="border px-2 py-2 text-center text-gray-300 sticky top-[68px] z-20 bg-emerald-50/40 border-b border-emerald-300 font-normal">
                      -
                    </th>
                  )
                )}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {Array.isArray(data.students) && data.students.length > 0 ? (
              data.students.map((s: any, sIdx: number) => (
                <tr key={s.student_id || s.reg_no || sIdx} className="hover:bg-gray-50/80 transition">
                  <td className="border px-3 py-1.5 font-mono font-medium text-gray-800 sticky left-0 bg-white z-10">
                    {s.reg_no || s.student_id}
                  </td>
                  <td className="border px-3 py-1.5 font-medium text-gray-900 truncate max-w-[180px]">
                    {s.name}
                  </td>
                  {coNumbers.flatMap((co) =>
                    subColumns.length > 0 ? (
                      subColumns.map((col) => {
                        if (col.kind === 'total' || col.id === 'co_total') {
                          return (
                            <td
                              key={`cell-${s.student_id || s.reg_no}-${co}-${col.id}`}
                              className="border px-2 py-1.5 text-center font-mono font-bold bg-amber-50/90 text-amber-950 border-amber-200"
                            >
                              {getCoTotalValue(s, co)}
                            </td>
                          );
                        }
                        return (
                          <td
                            key={`cell-${s.student_id || s.reg_no}-${co}-${col.id}`}
                            className={`border px-2 py-1.5 text-center font-mono ${
                              col.kind === 'formula'
                                ? 'bg-purple-50/30 font-semibold text-purple-900'
                                : col.kind === 'weighted'
                                ? 'bg-blue-50/20 text-blue-950 font-medium'
                                : 'text-gray-800'
                            }`}
                          >
                            {getCellValue(s, col, co)}
                          </td>
                        );
                      })
                    ) : (
                      <td key={`cell-${s.student_id || s.reg_no}-${co}-empty`} className="border px-2 py-1.5 text-center text-gray-400">
                        -
                      </td>
                    )
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2 + coNumbers.length * Math.max(1, subColumns.length)} className="border px-4 py-8 text-center text-gray-400">
                  No student records found for this course.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
