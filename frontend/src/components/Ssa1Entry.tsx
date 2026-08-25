import React from 'react';
import Ssa1SheetEntry from './Ssa1SheetEntry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
};

export default function Ssa1Entry({ subjectId, teachingAssignmentId, label }: Props) {
  return (
    <Ssa1SheetEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey="ssa1"
      label={label || 'SSA1'}
    />
  );
}
