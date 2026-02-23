import React from 'react';
import LabEntry from './LabEntry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
};

export default function Review2Entry({ subjectId, teachingAssignmentId, label }: Props) {
  return (
    <LabEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey="review2"
      label={label || 'Review 2'}
      coA={3}
      coB={4}
      allCos={[1, 2, 3, 4, 5]}
    />
  );
}
