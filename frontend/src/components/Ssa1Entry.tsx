import React from 'react';
import Ssa1SheetEntry from './Ssa1SheetEntry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
  classType?: string | null;
  questionPaperType?: string | null;
};

export default function Ssa1Entry({ subjectId, teachingAssignmentId, label, classType, questionPaperType }: Props) {
  return (
    <Ssa1SheetEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey="ssa1"
      label={label || 'SSA1'}
      classType={classType}
      questionPaperType={questionPaperType}
    />
  );
}
