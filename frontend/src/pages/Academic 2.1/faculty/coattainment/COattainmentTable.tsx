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

  // Build normalized lookup map for tokens
  const upperContext: Record<string, number> = {};
  for (const [k, v] of Object.entries(context || {})) {
    const uk = String(k).toUpperCase().trim();
    upperContext[uk] = typeof v === 'number' && !isNaN(v) ? v : 0;
    const normK = uk.replace(/[^A-Z0-9]+/g, '_');
    upperContext[normK] = upperContext[uk];
    const dashK = uk.replace(/[^A-Z0-9]+/g, '-');
    upperContext[dashK] = upperContext[uk];
  }

  // Replace bracketed tokens like [COx-OBT-WEIGHT] or [CO1-MAX-WEIGHT] with numeric values
  let replaced = expr.replace(/\[([^\]]+)\]/g, (_, token) => {
    const rawKey = String(token).toUpperCase().trim();
    if (rawKey in upperContext) return String(upperContext[rawKey]);
    const normKey = rawKey.replace(/[^A-Z0-9]+/g, '_');
    if (normKey in upperContext) return String(upperContext[normKey]);
    const dashKey = rawKey.replace(/[^A-Z0-9]+/g, '-');
    if (dashKey in upperContext) return String(upperContext[dashKey]);
    return '0';
  });

  // Also replace any unbracketed COX-OBT-WEIGHT or COX-MAX-WEIGHT tokens if typed without brackets
  for (const [k, v] of Object.entries(upperContext)) {
    if (k.length >= 3 && !/^[0-9]+$/.test(k)) {
      const escaped = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      replaced = replaced.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), String(v));
    }
  }

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
    if (found) return Number(sum.toFixed(2));
    if (Array.isArray(student?.co_totals)) {
      return Number(student.co_totals[coNum - 1] ?? 0);
    }
    return 0;
  };

  const getWeightedTotal = (student: any, coNum: number) => {
    // 1. If weighted_marks dictionary is present on student, compute exact sum across regular + CQI exams
    if (student?.weighted_marks && typeof student.weighted_marks === 'object') {
      let sum = 0;
      let found = false;
      if (Array.isArray(data.exams)) {
        data.exams.forEach((ex: any) => {
          const exId = String(ex?.id || '');
          const wmKey = `${exId}_CO${coNum}`;
          const wmExamKey = `${exId}_exam_CO${coNum}`;
          if (student.weighted_marks[wmKey] !== undefined) {
            const v = Number(student.weighted_marks[wmKey]);
            if (!Number.isNaN(v)) {
              sum += v;
              found = true;
            }
          } else if (student.weighted_marks[wmExamKey] !== undefined) {
            const v = Number(student.weighted_marks[wmExamKey]);
            if (!Number.isNaN(v)) {
              sum += v;
              found = true;
            }
          }
        });
      }
      if (found) return Number(sum.toFixed(2));
    }

    // 2. Fallback to student.co_totals array
    if (Array.isArray(student?.co_totals)) {
      return Number(Number(student.co_totals[coNum - 1] ?? 0).toFixed(2));
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

  const getCalculatedAttainment = (student: any, coNum: number) => {
    let coExamsMaxWeight = 0;
    const examList = Array.isArray(data.exams) && data.exams.length > 0 
      ? data.exams 
      : Array.isArray(data.class_type?.exam_assignments) 
        ? data.class_type.exam_assignments 
        : [];

    if (Array.isArray(examList)) {
      examList.forEach((ex: any) => {
        if (String(ex?.kind || '').toLowerCase() === 'cqi') return;
        const coWeights = ex?.co_weights;
        const covered = Array.isArray(ex?.covered_cos) ? ex.covered_cos : [];
        const examWeight = Number(ex?.weight ?? 0);

        if (coWeights && typeof coWeights === 'object' && (coWeights[coNum] != null || coWeights[String(coNum)] != null)) {
          const w = Number(coWeights[coNum] ?? coWeights[String(coNum)] ?? 0);
          // Validate: co_weights must represent course weightage, NOT raw question marks.
          // If the value exceeds the exam's total weight, it's raw marks — fall back to weight/covered.
          if (!Number.isNaN(w) && w <= examWeight + 0.01) {
            coExamsMaxWeight += w;
          } else if (covered.includes(coNum)) {
            // co_weights[coNum] appears to be raw marks — use exam weight split instead
            const pw = Number(ex?.weight_per_co ?? 0);
            if (!Number.isNaN(pw) && pw > 0) {
              coExamsMaxWeight += pw;
            } else if (examWeight > 0 && covered.length > 0) {
              coExamsMaxWeight += examWeight / covered.length;
            }
          }
        } else if (covered.includes(coNum)) {
          const pw = Number(ex?.weight_per_co ?? 0);
          if (!Number.isNaN(pw) && pw > 0) {
            coExamsMaxWeight += pw;
          } else if (examWeight > 0 && covered.length > 0) {
            coExamsMaxWeight += examWeight / covered.length;
          }
        }
        if (ex?.cia_enabled && covered.includes(coNum)) {
          const ciaW = Number(ex?.cia_weight ?? 0);
          if (ciaW > 0) {
            coExamsMaxWeight += ex?.cia_weight_per_co ? ciaW : (ciaW / Math.max(covered.length, 1));
          }
        }
      });
    }

    let finalCoMaxWeight = Number(coExamsMaxWeight.toFixed(4));
    if (finalCoMaxWeight <= 0) {
      // Fall back: sum of exam weights for COs that cover this CO number
      if (Array.isArray(examList)) {
        examList.forEach((ex: any) => {
          if (String(ex?.kind || '').toLowerCase() === 'cqi') return;
          const covered = Array.isArray(ex?.covered_cos) ? ex.covered_cos : [];
          if (covered.includes(coNum)) {
            finalCoMaxWeight += Number(ex?.weight ?? 0) / Math.max(covered.length, 1);
          }
        });
        finalCoMaxWeight = Number(finalCoMaxWeight.toFixed(4));
      }
    }
    if (finalCoMaxWeight <= 0) {
      const totalInternal = Number(data.total_internal_marks || data.class_type?.total_internal_marks || 40);
      finalCoMaxWeight = Number((totalInternal / (data.co_count || 5)).toFixed(2));
    }

    // Determine obtained weight for student in this CO
    let coObtWeight = 0;
    if (Array.isArray(student?.co_totals) && student.co_totals[coNum - 1] !== undefined) {
      coObtWeight = Number(student.co_totals[coNum - 1] ?? 0);
    } else {
      coObtWeight = getWeightedTotal(student, coNum);
    }

    if (finalCoMaxWeight > 0 && coObtWeight >= 0) {
      const calc = (coObtWeight / finalCoMaxWeight) * 50;
      return Number.isInteger(calc) ? calc : Number(calc.toFixed(2));
    }
    return '-';
  };

  const getCoTotalValue = (student: any, coNum: number, visitedColIds = new Set<string>()) => {
    return getCalculatedAttainment(student, coNum);
  };

  const evaluateFormulaForStudent = (student: any, formula: string, coNum: number, visitedColIds = new Set<string>()) => {
    return getCalculatedAttainment(student, coNum);
  };

  const getCellValue = (student: any, col: ColumnDef, coNum: number) => {
    if (col.kind === 'total' || col.id === 'co_total') {
      return getCalculatedAttainment(student, coNum);
    }
    if (col.kind === 'formula') {
      return getCalculatedAttainment(student, coNum);
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
    return getCalculatedAttainment(student, coNum);
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
