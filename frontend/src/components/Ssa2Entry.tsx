import React from 'react';
import Ssa2SheetEntry from './Ssa2SheetEntry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
};

export default function Ssa2Entry({ subjectId, teachingAssignmentId, label }: Props) {
  return (
    <Ssa2SheetEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey="ssa2"
      label={label || 'SSA2'}
    />
  );
}
