import React from 'react';
import Ssa2SheetEntry from './Ssa2SheetEntry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
  classType?: string | null;
  questionPaperType?: string | null;
};

export default function Ssa2Entry({ subjectId, teachingAssignmentId, label, classType, questionPaperType }: Props) {
  return (
    <Ssa2SheetEntry subjectId={subjectId} teachingAssignmentId={teachingAssignmentId} assessmentKey="ssa2" label={label || 'SSA2'} classType={classType} questionPaperType={questionPaperType} />
  );
}
