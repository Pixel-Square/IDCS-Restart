export type QpType = 'QP1' | 'QP2' | 'TCPR' | 'TCPL' | 'OE';

export type Question = { key: string; label: string; max: number };

export function getQuestions(qpType: QpType): Question[] {
  if (qpType === 'TCPR' || qpType === 'TCPL') {
    const questions = Array.from({ length: 12 }, (_, i) => {
      const idx = i + 1;
      return { key: `q${idx}`, label: `Q${idx}`, max: idx <= 8 ? 2 : 16 };
    });
    questions.push({ key: 'review', label: 'Review', max: 30 });
    return questions;
  }

  if (qpType === 'OE') {
    return [
      { key: 'q1', label: 'Q1', max: 2 },
      { key: 'q2', label: 'Q2', max: 2 },
      { key: 'q3', label: 'Q3', max: 2 },
      { key: 'q4', label: 'Q4', max: 2 },
      { key: 'q5', label: 'Q5', max: 2 },
      { key: 'q6', label: 'Q6', max: 2 },
      { key: 'q7', label: 'Q7', max: 16 },
      { key: 'q8', label: 'Q8', max: 16 },
      { key: 'q9', label: 'Q9', max: 16 },
    ];
  }

  if (qpType === 'QP2') {
    return [
      { key: 'q1', label: 'Q1', max: 2 },
      { key: 'q2', label: 'Q2', max: 2 },
      { key: 'q3', label: 'Q3', max: 2 },
      { key: 'q4', label: 'Q4', max: 2 },
      { key: 'q5', label: 'Q5', max: 2 },
      { key: 'q6', label: 'Q6', max: 2 },
      { key: 'q7', label: 'Q7', max: 2 },
      { key: 'q8', label: 'Q8', max: 2 },
      { key: 'q9', label: 'Q9', max: 2 },
      { key: 'q10', label: 'Q10', max: 2 },
      { key: 'q11', label: 'Q11', max: 14 },
      { key: 'q12', label: 'Q12', max: 14 },
      { key: 'q13', label: 'Q13', max: 14 },
      { key: 'q14', label: 'Q14', max: 14 },
      { key: 'q15', label: 'Q15', max: 14 },
      { key: 'q16', label: 'Q16', max: 10 },
    ];
  }

  return [
    { key: 'q1', label: 'Q1', max: 2 },
    { key: 'q2', label: 'Q2', max: 2 },
    { key: 'q3', label: 'Q3', max: 2 },
    { key: 'q4', label: 'Q4', max: 2 },
    { key: 'q5', label: 'Q5', max: 2 },
    { key: 'q6', label: 'Q6', max: 2 },
    { key: 'q7', label: 'Q7', max: 2 },
    { key: 'q8', label: 'Q8', max: 2 },
    { key: 'q9', label: 'Q9', max: 2 },
    { key: 'q10', label: 'Q10', max: 2 },
    { key: 'q11', label: 'Q11', max: 16 },
    { key: 'q12', label: 'Q12', max: 16 },
    { key: 'q13', label: 'Q13', max: 16 },
    { key: 'q14', label: 'Q14', max: 16 },
    { key: 'q15', label: 'Q15', max: 16 },
  ];
}
