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

  const getRawTotal = (student: any, coNum: number): number => {
    if (!data) return 0;
    const examMarks = student?.exam_marks || {};
    let total = 0;
    Object.values(examMarks).forEach((em: any) => {
      if (em?.is_absent) return;
      const coKey = `co${coNum}`;
      if (typeof em?.[coKey] === 'number') {
        total += em[coKey];
      }
    });
    return Number.isInteger(total) ? total : Number(total.toFixed(2));
  };

  const getWeightedTotal = (student: any, coNum: number): number => {
    if (!data) return 0;
    if (Array.isArray(student?.co_totals) && student.co_totals[coNum - 1] !== undefined) {
      const val = Number(student.co_totals[coNum - 1] ?? 0);
      return Number.isInteger(val) ? val : Number(val.toFixed(2));
    }
    const examMarks = student?.exam_marks || {};
    const exams = data?.exams || [];
    let weightedSum = 0;
    exams.forEach((ex: any) => {
      const em = examMarks[ex.id];
      if (!em || em.is_absent) return;
      const coVal = Number(em[`co${coNum}`] ?? 0);
      const maxMarks = Number(ex.max_marks || 0);
      let weight = Number(ex.weight || 0);
      if (ex.co_weights && typeof ex.co_weights === 'object') {
        const customW = ex.co_weights[String(coNum)] ?? ex.co_weights[coNum];
        if (customW !== undefined && customW !== null) {
          weight = Number(customW);
        }
      }
      if (maxMarks > 0 && weight > 0) {
        weightedSum += (coVal / maxMarks) * weight;
      }
    });
    return Number.isInteger(weightedSum) ? weightedSum : Number(weightedSum.toFixed(2));
  };

  const getExamScore = (student: any, examIdentifier: string, coNum: number): number => {
    if (!data) return 0;
    const examMarks = student?.exam_marks || {};
    const exams = data?.exams || [];
    const matched = exams.find((e: any) => {
      const eId = String(e.id || '');
      const eName = String(e.name || '').toLowerCase();
      const eDisplay = String(e.exam_display_name || '').toLowerCase();
      const eShort = String(e.short_name || '').toLowerCase();
      const target = String(examIdentifier || '').toLowerCase();
      return eId === target || eName.includes(target) || eDisplay.includes(target) || eShort.includes(target);
    });
    if (!matched) return 0;
    const em = examMarks[matched.id];
    if (!em || em.is_absent) return 0;
    const val = Number(em[`co${coNum}`] ?? 0);
    return Number.isInteger(val) ? val : Number(val.toFixed(2));
  };

  const getExamCoMaxMarks = (examIdentifier: string, coNum: number): number => {
    if (!data) return 0;
    const exams = data?.exams || [];
    const matched = exams.find((e: any) => {
      const eId = String(e.id || '');
      const eName = String(e.name || '').toLowerCase();
      const eDisplay = String(e.exam_display_name || '').toLowerCase();
      const eShort = String(e.short_name || '').toLowerCase();
      const target = String(examIdentifier || '').toLowerCase();
      return eId === target || eName.includes(target) || eDisplay.includes(target) || eShort.includes(target);
    });
    if (!matched) return 0;

    // Check co_max_map on exam
    if (matched.co_max_map && typeof matched.co_max_map === 'object') {
      const mVal = matched.co_max_map[coNum] ?? matched.co_max_map[String(coNum)];
      if (mVal !== undefined && mVal !== null && !isNaN(Number(mVal)) && Number(mVal) > 0) {
        return Number(mVal);
      }
    }

    // Check covered_cos and max_marks
    const covered = Array.isArray(matched.covered_cos) ? matched.covered_cos : [];
    if (covered.length > 0 && !covered.includes(coNum)) {
      return 0;
    }

    const maxPerCo = Number(matched.max_per_co || 0);
    if (maxPerCo > 0) return maxPerCo;

    const totalMax = Number(matched.max_marks || 0);
    if (totalMax > 0 && covered.length > 0) {
      return Number((totalMax / covered.length).toFixed(2));
    }

    return totalMax;
  };

  const getCoMaxWeight = (coNum: number): number => {
    if (!data) return 0;
    let finalCoMaxWeight = 0;
    const examList = data?.exams || [];
    const customVars = data?.cqi_config?.custom_vars || [];

    const checkedExams: string[] = [];
    if (data?.cqi_config && Array.isArray(data.cqi_config.exams) && data.cqi_config.exams.length > 0) {
      checkedExams.push(...data.cqi_config.exams);
    } else {
      customVars.forEach((v: any) => {
        if (v && v.exam && !checkedExams.includes(v.exam)) {
          checkedExams.push(v.exam);
        }
      });
    }

    if (checkedExams.length > 0 && examList.length > 0) {
      const matchedExams = examList.filter((ex: any) => {
        const name = String(ex?.name || '').trim().toLowerCase();
        const shortName = String(ex?.short_name || '').trim().toLowerCase();
        const displayName = String(ex?.exam_display_name || '').trim().toLowerCase();
        const code = String(ex?.code || '').trim().toLowerCase();
        const examCode = String(ex?.exam || '').trim().toLowerCase();
        const examId = String(ex?.id || '').trim().toLowerCase();

        return checkedExams.some((chk) => {
          const c = String(chk || '').trim().toLowerCase();
          return c === name || c === shortName || c === displayName || c === code || c === examCode || c === examId;
        });
      });

      if (matchedExams.length > 0) {
        matchedExams.forEach((ex: any) => {
          const covered = Array.isArray(ex?.covered_cos) ? ex.covered_cos : [];
          if (covered.includes(coNum)) {
            const exTotalWeight = Number(ex?.weight ?? 0);
            let parsedWeight = 0;
            if (ex.co_weights && typeof ex.co_weights === 'object') {
              const directWeight = ex.co_weights[String(coNum)] ?? ex.co_weights[coNum];
              if (directWeight !== undefined && directWeight !== null && !isNaN(Number(directWeight))) {
                parsedWeight = Number(directWeight);
              }
              if (parsedWeight > 0 && exTotalWeight > 0) {
                const totalCoWeightSum = Number((Object.values(ex.co_weights) as any[]).reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0));
                if (Math.abs(totalCoWeightSum - exTotalWeight) > 0.05) {
                  parsedWeight = 0;
                }
              }
            }
            if (parsedWeight > 0) {
              finalCoMaxWeight += parsedWeight;
            } else {
              finalCoMaxWeight += exTotalWeight / Math.max(covered.length, 1);
            }
          }
        });
        finalCoMaxWeight = Number(finalCoMaxWeight.toFixed(4));
      }
    }

    if (finalCoMaxWeight <= 0 && examList.length > 0) {
      let nonCqiExamsWithWeights = 0;
      examList.forEach((ex: any) => {
        if (String(ex?.kind || '').toLowerCase() === 'cqi') return;
        const covered = Array.isArray(ex?.covered_cos) ? ex.covered_cos : [];
        if (covered.includes(coNum)) {
          const exTotalWeight = Number(ex?.weight ?? 0);
          let parsedWeight = 0;
          if (ex.co_weights && typeof ex.co_weights === 'object') {
            const directWeight = ex.co_weights[String(coNum)] ?? ex.co_weights[coNum];
            if (directWeight !== undefined && directWeight !== null && !isNaN(Number(directWeight))) {
              parsedWeight = Number(directWeight);
            }
            if (parsedWeight > 0 && exTotalWeight > 0) {
              const totalCoWeightSum = Number((Object.values(ex.co_weights) as any[]).reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0));
              if (Math.abs(totalCoWeightSum - exTotalWeight) > 0.05) {
                parsedWeight = 0;
              }
            }
          }
          if (parsedWeight > 0) {
            finalCoMaxWeight += parsedWeight;
            nonCqiExamsWithWeights++;
          } else if (exTotalWeight > 0) {
            finalCoMaxWeight += exTotalWeight / Math.max(covered.length, 1);
            nonCqiExamsWithWeights++;
          }
        }
      });
      finalCoMaxWeight = Number(finalCoMaxWeight.toFixed(4));

      if (finalCoMaxWeight <= 0 && nonCqiExamsWithWeights === 0) {
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
    if (finalCoMaxWeight <= 0 && data) {
      const totalInternal = Number(data.total_internal_marks || data.class_type?.total_internal_marks || 40);
      finalCoMaxWeight = Number((totalInternal / (data.co_count || 5)).toFixed(2));
    }
    return finalCoMaxWeight;
  };

  const getCalculatedAttainment = (student: any, coNum: number) => {
    const finalCoMaxWeight = getCoMaxWeight(coNum);
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

  const coNumbers = useMemo(() => Array.from({ length: coCount }, (_, i) => i + 1), [coCount]);

  // Compute a single student's subcolumn values iteratively (left to right)
  const computeStudentRowValues = (student: any, coNum: number): Record<string, number | '-'> => {
    const rowValues: Record<string, number | '-'> = {};
    const obtWeight = Array.isArray(student?.co_totals) && student.co_totals[coNum - 1] !== undefined
      ? Number(student.co_totals[coNum - 1] ?? 0)
      : getWeightedTotal(student, coNum);
    const maxWeight = getCoMaxWeight(coNum);
    const rawTotal = getRawTotal(student, coNum);
    const weightedTotal = getWeightedTotal(student, coNum);

    // Calculate raw marks and max marks exclusively for exam assignments with weight setted by admin
    let obtWeightSettedRaw = 0;
    let maxWeightSettedRaw = 0;

    if (data?.exams && Array.isArray(data.exams)) {
      data.exams.forEach((ex: any) => {
        const covered = Array.isArray(ex?.covered_cos) ? ex.covered_cos : [];
        if (!covered.includes(coNum)) return;

        // Check if admin has set weight for this CO or exam
        let hasWeight = false;
        if (ex.co_weights && typeof ex.co_weights === 'object') {
          const directWeight = ex.co_weights[String(coNum)] ?? ex.co_weights[coNum];
          if (directWeight !== undefined && directWeight !== null && !isNaN(Number(directWeight)) && Number(directWeight) > 0) {
            hasWeight = true;
          }
        }
        if (!hasWeight && Number(ex?.weight || 0) > 0) {
          hasWeight = true;
        }

        if (hasWeight) {
          const studentScore = getExamScore(student, ex.id, coNum);
          const maxScore = getExamCoMaxMarks(ex.id, coNum);
          obtWeightSettedRaw += studentScore;
          maxWeightSettedRaw += maxScore;
        }
      });
    }

    const baseContext: Record<string, number> = {
      [`CO${coNum}-OBT-WEIGHTSETTED-RAW-MARKS`]: obtWeightSettedRaw,
      [`COX-OBT-WEIGHTSETTED-RAW-MARKS`]: obtWeightSettedRaw,
      [`CO${coNum}-MAX-WEIGHTSETTED-RAW-MARKS`]: maxWeightSettedRaw,
      [`COX-MAX-WEIGHTSETTED-RAW-MARKS`]: maxWeightSettedRaw,
      [`CO${coNum}-OBT-WEIGHT`]: obtWeight,
      [`CO${coNum}-MAX-WEIGHT`]: maxWeight,
      [`CO${coNum}-TOTAL-RAW`]: rawTotal,
      [`CO${coNum}-TOTAL-WEIGHT`]: weightedTotal,
      [`CO${coNum}-WEIGHTED`]: weightedTotal,
      [`COX-OBT-WEIGHT`]: obtWeight,
      [`COX-MAX-WEIGHT`]: maxWeight,
      [`COX-TOTAL-RAW`]: rawTotal,
      [`COX-TOTAL-WEIGHT`]: weightedTotal,
      [`COX-WEIGHTED`]: weightedTotal,
      [`COX-EXAMS-MAX-WEIGHT`]: maxWeight,
      [`CO${coNum}-EXAMS-MAX-WEIGHT`]: maxWeight,
    };

    if (data?.exams) {
      data.exams.forEach((ex: any) => {
        const eName = ex?.exam_display_name || ex?.exam_name || ex?.name || ex?.short_name || ex?.title || 'EXAM';
        const eCode = String(eName).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const score = getExamScore(student, ex.id, coNum);
        const maxScore = getExamCoMaxMarks(ex.id, coNum);

        baseContext[`CO${coNum}-${eCode}-RAW`] = score;
        baseContext[`CO${coNum}-${eCode}-OBT`] = score;
        baseContext[`${eCode}-CO${coNum}-RAW`] = score;
        baseContext[`${eCode}-CO${coNum}-OBT`] = score;
        baseContext[`COX-${eCode}-RAW`] = score;
        baseContext[`COX-${eCode}-OBT`] = score;
        baseContext[`${eCode}-COX-RAW`] = score;
        baseContext[`${eCode}-COX-OBT`] = score;
        baseContext[`CO${coNum}-${eCode}`] = score;
        baseContext[`COX-${eCode}`] = score;

        baseContext[`CO${coNum}-${eCode}-MAXMARK`] = maxScore;
        baseContext[`CO${coNum}-${eCode}-MAXMARKS`] = maxScore;
        baseContext[`CO${coNum}-${eCode}-MAX_MARK`] = maxScore;
        baseContext[`CO${coNum}-${eCode}-MAX_MARKS`] = maxScore;
        baseContext[`CO${coNum}-${eCode}-MAX`] = maxScore;
        baseContext[`COX-${eCode}-MAXMARK`] = maxScore;
        baseContext[`COX-${eCode}-MAXMARKS`] = maxScore;
        baseContext[`COX-${eCode}-MAX_MARK`] = maxScore;
        baseContext[`COX-${eCode}-MAX_MARKS`] = maxScore;
        baseContext[`COX-${eCode}-MAX`] = maxScore;
        baseContext[`${eCode}-CO${coNum}-MAXMARK`] = maxScore;
        baseContext[`${eCode}-COX-MAXMARK`] = maxScore;
        baseContext[`${eCode}-MAXMARK`] = maxScore;
      });
    }

    if (student?.exam_marks && typeof student.exam_marks === 'object') {
      for (const [k, obj] of Object.entries(student.exam_marks)) {
        if (!obj || typeof obj !== 'object') continue;
        const normKey = String(k).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const val = (obj as any)[`co${coNum}`] ?? (obj as any)[`co_${coNum}`];
        const numVal = typeof val === 'number' ? val : 0;

        baseContext[`CO${coNum}-${normKey}-RAW`] = numVal;
        baseContext[`COX-${normKey}-RAW`] = numVal;
        baseContext[`CO${coNum}-${normKey}-OBT`] = numVal;
        baseContext[`COX-${normKey}-OBT`] = numVal;
        baseContext[`${normKey}-CO${coNum}-RAW`] = numVal;
        baseContext[`${normKey}-COX-RAW`] = numVal;
        baseContext[`${normKey}-RAW`] = numVal;
        baseContext[`${normKey}-OBT`] = numVal;
        baseContext[normKey] = numVal;
      }
    }

    let runningSubcolSum = 0;

    // Evaluate subcolumns strictly in sequence from left to right
    subColumns.forEach((col) => {
      if (col.kind === 'total' || col.id === 'co_total') {
        if (col.formula && col.formula.trim()) {
          const evalCtx = {
            ...baseContext,
            [`CO${coNum}-SUBCOL-TOTAL`]: runningSubcolSum,
            [`COX-SUBCOL-TOTAL`]: runningSubcolSum,
            [`CO${coNum}-TOTAL`]: runningSubcolSum,
            [`COX-TOTAL`]: runningSubcolSum,
            [`CO_TOTAL`]: runningSubcolSum,
            [`CO${coNum}_TOTAL`]: runningSubcolSum,
            [`COX_TOTAL`]: runningSubcolSum,
          };
          const res = evaluateFormulaExpr(col.formula, evalCtx);
          const val = res !== null && !isNaN(res) ? (Number.isInteger(res) ? res : Number(res.toFixed(2))) : runningSubcolSum;
          rowValues[col.id] = val;
          runningSubcolSum = typeof val === 'number' ? val : runningSubcolSum;
        } else {
          const val = Number.isInteger(runningSubcolSum) ? runningSubcolSum : Number(runningSubcolSum.toFixed(2));
          rowValues[col.id] = val;
        }
        return;
      }

      let colVal: number | '-' = '-';
      if (col.kind === 'raw') {
        colVal = getRawTotal(student, coNum);
      } else if (col.kind === 'weighted') {
        colVal = getWeightedTotal(student, coNum);
      } else if (col.kind === 'exam') {
        colVal = getExamScore(student, col.meta?.exam, coNum);
      } else if ((col.kind === 'formula' || col.formula) && col.formula?.trim()) {
        const evalCtx = {
          ...baseContext,
          [`CO${coNum}-SUBCOL-TOTAL`]: runningSubcolSum,
          [`COX-SUBCOL-TOTAL`]: runningSubcolSum,
          [`CO${coNum}-TOTAL`]: runningSubcolSum,
          [`COX-TOTAL`]: runningSubcolSum,
          [`CO_TOTAL`]: runningSubcolSum,
          [`CO${coNum}_TOTAL`]: runningSubcolSum,
          [`COX_TOTAL`]: runningSubcolSum,
        };
        const res = evaluateFormulaExpr(col.formula, evalCtx);
        if (res !== null && !isNaN(res)) {
          colVal = Number.isInteger(res) ? res : Number(res.toFixed(2));
        } else {
          colVal = getCalculatedAttainment(student, coNum);
        }
      } else {
        colVal = getCalculatedAttainment(student, coNum);
      }

      rowValues[col.id] = colVal;
      if (typeof colVal === 'number') {
        runningSubcolSum += colVal;
        const cleanLabel = col.label.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase().replace(/^_+|_+$/g, '');
        baseContext[col.id] = colVal;
        baseContext[col.id.toUpperCase()] = colVal;
        baseContext[`COL-${col.id.toUpperCase()}`] = colVal;
        if (cleanLabel) {
          baseContext[cleanLabel] = colVal;
          baseContext[`CO${coNum}-${cleanLabel}`] = colVal;
          baseContext[`COX-${cleanLabel}`] = colVal;
        }
      }
    });

    return rowValues;
  };

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
        map[sId][coKey] = computeStudentRowValues(s, co);
      });
    });

    return map;
  }, [data, subColumns, coNumbers]);

  const getCellValue = (student: any, col: ColumnDef, coNum: number): number | '-' => {
    const sId = String(student?.student_id || student?.reg_no || '');
    const coKey = `co${coNum}`;
    const cached = precalculatedAttainment[sId]?.[coKey]?.[col.id];
    if (cached !== undefined) return cached;
    return computeStudentRowValues(student, coNum)[col.id] ?? '-';
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
