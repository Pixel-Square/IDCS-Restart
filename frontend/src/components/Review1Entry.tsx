import React from 'react';
import Ssa1SheetEntry from './Ssa1SheetEntry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
};

export default function Review1Entry({ subjectId, teachingAssignmentId, label }: Props) {
  return (
    <Ssa1SheetEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey="review1"
      label={label || 'Review 1'}
    />
  );
}
