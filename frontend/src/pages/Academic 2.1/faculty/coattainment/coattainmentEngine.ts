export type ColumnDef = {
  id: string;
  label: string;
  kind: 'raw' | 'weighted' | 'exam' | 'custom' | 'formula' | 'total';
  formula?: string;
  show_avg?: boolean;
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
    if (rawKey in upperContext) return ` ${upperContext[rawKey]} `;
    const normKey = rawKey.replace(/[^A-Z0-9]+/g, '_');
    if (normKey in upperContext) return ` ${upperContext[normKey]} `;
    const dashKey = rawKey.replace(/[^A-Z0-9]+/g, '-');
    if (dashKey in upperContext) return ` ${upperContext[dashKey]} `;
    return ' 0 ';
  });

  // Replace any remaining words (variable names without brackets)
  replaced = replaced.replace(/\b([A-Z][A-Z0-9_-]*)\b/gi, (word) => {
    const uw = word.toUpperCase().trim();
    if (uw in upperContext) return ` ${upperContext[uw]} `;
    const nw = uw.replace(/[^A-Z0-9]+/g, '_');
    if (nw in upperContext) return ` ${upperContext[nw]} `;
    return ' 0 ';
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

export function getRawTotal(data: any, student: any, coNum: number): number {
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
}

export function getExamScore(data: any, student: any, examIdentifier: string, coNum: number): number {
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
}

export function getExamCoMaxMarks(data: any, examIdentifier: string, coNum: number): number {
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

  if (matched.co_max_map && typeof matched.co_max_map === 'object') {
    const mVal = matched.co_max_map[coNum] ?? matched.co_max_map[String(coNum)];
    if (mVal !== undefined && mVal !== null && !isNaN(Number(mVal)) && Number(mVal) > 0) {
      return Number(mVal);
    }
  }

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
}

export function getCoMaxWeight(data: any, coNum: number): number {
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
}

export function getWeightedTotal(data: any, student: any, coNum: number): number {
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
}

export function getCalculatedAttainment(data: any, student: any, coNum: number): number | '-' {
  const finalCoMaxWeight = getCoMaxWeight(data, coNum);
  let coObtWeight = 0;
  if (Array.isArray(student?.co_totals) && student.co_totals[coNum - 1] !== undefined) {
    coObtWeight = Number(student.co_totals[coNum - 1] ?? 0);
  } else {
    coObtWeight = getWeightedTotal(data, student, coNum);
  }
  if (finalCoMaxWeight > 0 && coObtWeight >= 0) {
    const calc = (coObtWeight / finalCoMaxWeight) * 50;
    return Number.isInteger(calc) ? calc : Number(calc.toFixed(2));
  }
  return '-';
}

export function computeStudentRowValues(
  data: any,
  subColumns: ColumnDef[],
  student: any,
  coNum: number
): Record<string, number | '-'> {
  const rowValues: Record<string, number | '-'> = {};
  const obtWeight = Array.isArray(student?.co_totals) && student.co_totals[coNum - 1] !== undefined
    ? Number(student.co_totals[coNum - 1] ?? 0)
    : getWeightedTotal(data, student, coNum);
  const maxWeight = getCoMaxWeight(data, coNum);
  const rawTotal = getRawTotal(data, student, coNum);
  const weightedTotal = getWeightedTotal(data, student, coNum);

  // Calculate raw marks and max marks exclusively for exam assignments with weight setted by admin
  let obtWeightSettedRaw = 0;
  let maxWeightSettedRaw = 0;

  if (data?.exams && Array.isArray(data.exams)) {
    data.exams.forEach((ex: any) => {
      const covered = Array.isArray(ex?.covered_cos) ? ex.covered_cos : [];
      if (!covered.includes(coNum)) return;

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
        const studentScore = getExamScore(data, student, ex.id, coNum);
        const maxScore = getExamCoMaxMarks(data, ex.id, coNum);
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
      const score = getExamScore(data, student, ex.id, coNum);
      const maxScore = getExamCoMaxMarks(data, ex.id, coNum);

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
      colVal = getRawTotal(data, student, coNum);
    } else if (col.kind === 'weighted') {
      colVal = getWeightedTotal(data, student, coNum);
    } else if (col.kind === 'exam') {
      colVal = getExamScore(data, student, col.meta?.exam, coNum);
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
        colVal = getCalculatedAttainment(data, student, coNum);
      }
    } else {
      colVal = getCalculatedAttainment(data, student, coNum);
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
}

export function getColumnAverage(
  data: any,
  subColumns: ColumnDef[],
  col: ColumnDef,
  coNum: number
): number | '-' {
  if (!Array.isArray(data?.students) || data.students.length === 0) return '-';
  let sum = 0;
  let count = 0;
  data.students.forEach((s: any) => {
    const rowVals = computeStudentRowValues(data, subColumns, s, coNum);
    const val = rowVals[col.id];
    if (typeof val === 'number' && !isNaN(val)) {
      sum += val;
      count += 1;
    }
  });
  if (count === 0) return '-';
  const avg = sum / count;
  return Number.isInteger(avg) ? avg : Number(avg.toFixed(2));
}
