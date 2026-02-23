import React from 'react';
import LabEntry from './LabEntry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
};

export default function Review1Entry({ subjectId, teachingAssignmentId, label }: Props) {
  return (
    <LabEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey="review1"
      label={label || 'Review 1'}
      coA={1}
      coB={2}
    />
  );
}
