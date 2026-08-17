import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../../../services/fetchAuth';

export type ColumnDef = {
  id: string;
  label: string;
  kind: 'raw' | 'weighted' | 'exam' | 'custom' | 'formula' | 'total';
  formula?: string;
  meta?: any;
};

/**
 * Safely evaluates a mathematical expression string with a numeric context map.
 * Operates without eval() or Function() constructor for strict security.
 */
export function evaluateFormulaExpr(expr: string, context: Record<string, number>): number | null {
  if (!expr || typeof expr !== 'string') return null;

  // Replace bracketed tokens like [COx-TOTAL-RAW] or [CO1-TOTAL-RAW] with numeric values
  const replaced = expr.replace(/\[([^\]]+)\]/g, (_, token) => {
    const rawKey = String(token).toUpperCase().trim();
    if (rawKey in context) return String(context[rawKey]);
    const normKey = rawKey.replace(/[^A-Z0-9]+/g, '_');
    if (normKey in context) return String(context[normKey]);
    return '0';
  });

  const tokens = replaced.match(/([0-9]+\.?[0-9]*|\+|\-|\*|\/|\%|\(|\))/g);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < tokens!.length && (tokens![pos] === '+' || tokens![pos] === '-')) {
      const op = tokens![pos++];
      const right = parseTerm();
      if (op === '+') left += right;
      else left -= right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < tokens!.length && (tokens![pos] === '*' || tokens![pos] === '/' || tokens![pos] === '%')) {
      const op = tokens![pos++];
      const right = parseFactor();
      if (op === '*') left *= right;
      else if (op === '/') left = right !== 0 ? left / right : 0;
      else if (op === '%') left = right !== 0 ? left % right : 0;
    }
    return left;
  }

  function parseFactor(): number {
    if (pos >= tokens!.length) return 0;
    const token = tokens![pos++];
    if (token === '(') {
      const val = parseExpression();
      if (pos < tokens!.length && tokens![pos] === ')') pos++;
      return val;
    }
    if (token === '-') return -parseFactor();
    if (token === '+') return parseFactor();
    const num = parseFloat(token);
    return isNaN(num) ? 0 : num;
  }

  try {
    const res = parseExpression();
    return isNaN(res) || !isFinite(res) ? null : res;
  } catch {
    return null;
  }
}

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

  if (fetching && !data) {
    return <div className="p-6 text-sm text-gray-500">Loading CO attainment table…</div>;
  }

  if (!data) {
    return <div className="p-6 text-sm text-gray-400">No CO attainment data available.</div>;
  }

  const coCount = data.co_count || 5;

  const storedColumns: ColumnDef[] = (() => {
    try {
      let map: Record<string, ColumnDef[]> = {};

      const rawMap = localStorage.getItem('coatt_columns_by_combination');
      if (rawMap) {
        try {
          const parsed = JSON.parse(rawMap);
          if (parsed && typeof parsed === 'object') map = { ...parsed };
        } catch {}
      }

      if (data.class_type?.coattainment_layout && typeof data.class_type.coattainment_layout === 'object') {
        map = { ...map, ...data.class_type.coattainment_layout };
      }

      if (Object.keys(map).length === 0) return [];

      const classTypeId = data.class_type?.id ?? data.course?.class_type?.id ?? data.course?.class_type_id ?? data.class_type_id ?? '';
      const qpType = (typeof data.qp_type === 'object' ? data.qp_type?.code || data.qp_type?.name : data.qp_type) ?? data.course?.question_paper_type ?? data.course?.qp_type ?? data.question_paper_type ?? '';
      const comboKey = classTypeId && qpType ? `${classTypeId}::${qpType}` : `course:${courseId}`;

      if (Array.isArray(map[comboKey]) && map[comboKey].length > 0) return map[comboKey];

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

      const keysWithColumns = Object.keys(map).filter((k) => Array.isArray(map[k]) && map[k].length > 0);
      if (keysWithColumns.length > 0) {
        return map[keysWithColumns[0]];
      }

      return [];
    } catch {
      return [];
    }
  })();

  const subColumns: ColumnDef[] = (() => {
    if (storedColumns.length === 0) return [];
    const hasTotal = storedColumns.some((c) => c.kind === 'total' || c.id === 'co_total');
    if (!hasTotal) {
      return [...storedColumns, { id: 'co_total', label: 'COx Total', kind: 'total' }];
    }
    return storedColumns;
  })();

  const formatSubColumnTitle = (label: string, coNum: number) => {
    const str = label || `CO${coNum}`;
    return str.replace(/\bCOx\b/gi, `CO${coNum}`).replace(/\bCOX\b/g, `CO${coNum}`);
  };

  const getExamCode = (ex: any) => {
    const name = ex?.exam_display_name || ex?.exam_name || ex?.name || ex?.short_name || ex?.title || ex?.label || 'EXAM';
    return String(name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  };

  const getRawTotal = (student: any, coNum: number) => {
    let sum = 0;
    let found = false;
    if (student?.exam_marks && typeof student.exam_marks === 'object') {
      Object.values(student.exam_marks).forEach((exObj: any) => {
        if (!exObj || typeof exObj !== 'object') return;
        const val = exObj[`co${coNum}`] ?? exObj[`co_${coNum}`];
        if (typeof val === 'number') {
          sum += val;
          found = true;
        }
      });
    }
    if (found) return sum;
    if (Array.isArray(student?.co_totals)) {
      return Number(student.co_totals[coNum - 1] ?? 0);
    }
    return 0;
  };

  const getWeightedTotal = (student: any, coNum: number) => {
    if (Array.isArray(student?.co_totals)) {
      return Number(student.co_totals[coNum - 1] ?? 0);
    }
    return 0;
  };

  const getExamScore = (student: any, examRef: any, coNum: number): number | '-' => {
    if (!student?.exam_marks || typeof student.exam_marks !== 'object') return '-';

    const examId = String(examRef?.id || '');
    const examCode = getExamCode(examRef);
    const examName = String(examRef?.exam_display_name || examRef?.name || examRef?.exam || '').trim().toLowerCase();

    let matchedExamObj: any = null;
    for (const [k, obj] of Object.entries(student.exam_marks)) {
      const normK = String(k).trim().toLowerCase();
      if (k === examId || getExamCode({ name: k }) === examCode || normK === examName) {
        matchedExamObj = obj;
        break;
      }
    }

    if (matchedExamObj && typeof matchedExamObj === 'object') {
      const val = matchedExamObj[`co${coNum}`] ?? matchedExamObj[`co_${coNum}`];
      if (typeof val === 'number') return val;
    }
    return '-';
  };

  const getCoTotalValue = (student: any, coNum: number, visitedColIds = new Set<string>()) => {
    let sum = 0;
    let hasAnyNumeric = false;

    const evalColValue = (col: ColumnDef): number | null => {
      if (!col || visitedColIds.has(col.id)) return null;

      if (col.kind === 'raw') {
        const raw = getRawTotal(student, coNum);
        return typeof raw === 'number' && !isNaN(raw) ? raw : null;
      }
      if (col.kind === 'weighted') {
        const w = getWeightedTotal(student, coNum);
        return typeof w === 'number' && !isNaN(w) ? w : null;
      }
      if (col.kind === 'exam') {
        const sc = getExamScore(student, col.meta?.exam, coNum);
        return typeof sc === 'number' && !isNaN(sc) ? sc : null;
      }
      if (col.kind === 'formula' && col.formula) {
        // Skip formula columns that depend on CO Sub-Column Total to prevent self-reference
        if (/\[CO[x0-9]*-?(CO-)?(SUBCOL(UMNS)?-)?TOTAL\]/i.test(col.formula)) return null;

        const nextVisited = new Set(visitedColIds);
        nextVisited.add(col.id);
        const fVal = evaluateFormulaForStudent(student, col.formula, coNum, nextVisited);
        return typeof fVal === 'number' && !isNaN(fVal) ? fVal : null;
      }
      return null;
    };

    for (const col of subColumns) {
      if (col.kind === 'total' || col.id === 'co_total') continue;
      const val = evalColValue(col);
      if (typeof val === 'number') {
        sum += val;
        hasAnyNumeric = true;
      }
    }

    if (!hasAnyNumeric) {
      const raw = getRawTotal(student, coNum);
      if (typeof raw === 'number' && raw > 0) return Number.isInteger(raw) ? raw : Number(raw.toFixed(2));
      const weighted = getWeightedTotal(student, coNum);
      if (typeof weighted === 'number' && weighted > 0) return Number.isInteger(weighted) ? weighted : Number(weighted.toFixed(2));
      return '-';
    }
    return Number.isInteger(sum) ? sum : Number(sum.toFixed(2));
  };

  const evaluateFormulaForStudent = (student: any, formula: string, coNum: number, visitedColIds = new Set<string>()) => {
    const rawTotal = getRawTotal(student, coNum);
    const weightedTotal = getWeightedTotal(student, coNum);
    const coTotalVal = getCoTotalValue(student, coNum, visitedColIds);
    const numericCoTotal = typeof coTotalVal === 'number' ? coTotalVal : 0;

    const context: Record<string, number> = {
      'COX-SUBCOL-TOTAL': numericCoTotal,
      'COX_SUBCOL_TOTAL': numericCoTotal,
      'COX-SUBCOLUMNS-TOTAL': numericCoTotal,
      'COX_SUBCOLUMNS_TOTAL': numericCoTotal,
      'COX-TOTAL': numericCoTotal,
      'COX_TOTAL': numericCoTotal,
      'COX-CO-TOTAL': numericCoTotal,
      'COX_CO_TOTAL': numericCoTotal,

      [`CO${coNum}-SUBCOL-TOTAL`]: numericCoTotal,
      [`CO${coNum}_SUBCOL_TOTAL`]: numericCoTotal,
      [`CO${coNum}-SUBCOLUMNS-TOTAL`]: numericCoTotal,
      [`CO${coNum}_SUBCOLUMNS_TOTAL`]: numericCoTotal,
      [`CO${coNum}-TOTAL`]: numericCoTotal,
      [`CO${coNum}_TOTAL`]: numericCoTotal,
      [`CO${coNum}-CO-TOTAL`]: numericCoTotal,
      [`CO${coNum}_CO_TOTAL`]: numericCoTotal,

      'COX-TOTAL-RAW': rawTotal,
      'COX_TOTAL_RAW': rawTotal,
      [`CO${coNum}-TOTAL-RAW`]: rawTotal,
      [`CO${coNum}_TOTAL_RAW`]: rawTotal,

      'COX-TOTAL-WEIGHT': weightedTotal,
      'COX_TOTAL_WEIGHT': weightedTotal,
      'COX-WEIGHTED': weightedTotal,
      'COX_WEIGHTED': weightedTotal,
      [`CO${coNum}-TOTAL-WEIGHT`]: weightedTotal,
      [`CO${coNum}_TOTAL_WEIGHT`]: weightedTotal,
      [`CO${coNum}-WEIGHTED`]: weightedTotal,
      [`CO${coNum}_WEIGHTED`]: weightedTotal,
    };

    if (Array.isArray(data.exams)) {
      data.exams.forEach((ex: any) => {
        const code = getExamCode(ex);
        const examVal = getExamScore(student, ex, coNum);
        const numericVal = typeof examVal === 'number' ? examVal : 0;

        context[`COX-${code}-RAW`] = numericVal;
        context[`COX_${code}_RAW`] = numericVal;
        context[`COX-${code}-OBT`] = numericVal;
        context[`COX_${code}_OBT`] = numericVal;
        context[`${code}-COX-RAW`] = numericVal;
        context[`${code}_COX_RAW`] = numericVal;

        context[`CO${coNum}-${code}-RAW`] = numericVal;
        context[`CO${coNum}_${code}_RAW`] = numericVal;
        context[`${code}-CO${coNum}-RAW`] = numericVal;
        context[`${code}_CO${coNum}_RAW`] = numericVal;
      });
    }

    const result = evaluateFormulaExpr(formula, context);
    if (result !== null) {
      return Number.isInteger(result) ? result : Number(result.toFixed(2));
    }
    return '-';
  };

  const getCellValue = (student: any, col: ColumnDef, coNum: number) => {
    if (col.kind === 'total' || col.id === 'co_total') {
      return getCoTotalValue(student, coNum);
    }
    if (col.kind === 'raw') {
      const val = getRawTotal(student, coNum);
      return Number.isInteger(val) ? val : Number(val.toFixed(2));
    }
    if (col.kind === 'weighted') {
      const val = getWeightedTotal(student, coNum);
      return Number.isInteger(val) ? val : Number(val.toFixed(2));
    }
    if (col.kind === 'exam') {
      return getExamScore(student, col.meta?.exam, coNum);
    }
    if (col.kind === 'formula' && col.formula) {
      return evaluateFormulaForStudent(student, col.formula, coNum, new Set([col.id]));
    }
    return '-';
  };

  const coNumbers = Array.from({ length: coCount }, (_, i) => i + 1);

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

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-800">
              <th rowSpan={2} className="border px-3 py-2 text-left font-semibold w-28 sticky left-0 bg-gray-100 z-10">
                Reg No
              </th>
              <th rowSpan={2} className="border px-3 py-2 text-left font-semibold w-40">
                Student Name
              </th>
              {coNumbers.map((co) => (
                <th
                  key={`co-header-${co}`}
                  colSpan={Math.max(1, subColumns.length)}
                  className="border px-3 py-1.5 text-center font-bold text-sm bg-blue-50 text-blue-900 border-blue-200"
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
                      className={`border px-2 py-1.5 text-center truncate ${
                        col.kind === 'total' || col.id === 'co_total'
                          ? 'font-bold min-w-[100px] max-w-[140px] bg-amber-100/90 text-amber-950 border-amber-300'
                          : 'font-medium min-w-[110px] max-w-[160px]'
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
                  <th key={`co-${co}-empty`} className="border px-2 py-1.5 text-center font-normal italic text-gray-400">
                    No columns
                  </th>
                )
              )}
            </tr>
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
