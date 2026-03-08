import React from 'react';
import LabEntry from './LabEntry';
import { normalizeObeClassType } from '../constants/classTypes';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
  classType?: string | null;
};

export default function Review2Entry({ subjectId, teachingAssignmentId, label, classType }: Props) {
  const useSsaPublishedLockUi = normalizeObeClassType(classType || '') === 'PROJECT';
  return (
    <LabEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey="review2"
      label={label || 'Review 2'}
      coA={3}
      coB={4}
      allCos={[1, 2, 3, 4, 5]}
      useSsaPublishedLockUi={useSsaPublishedLockUi}
    />
  );
}
