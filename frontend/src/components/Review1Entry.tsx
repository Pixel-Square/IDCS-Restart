import React from 'react';
import LabEntry from './LabEntry';
import { normalizeObeClassType } from '../constants/classTypes';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  label?: string;
  classType?: string | null;
};

export default function Review1Entry({ subjectId, teachingAssignmentId, label, classType }: Props) {
  const useSsaPublishedLockUi = normalizeObeClassType(classType || '') === 'PROJECT';
  return (
    <LabEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey="review1"
      label={label || 'Review 1'}
      coA={1}
      coB={2}
      allCos={[1, 2, 3, 4, 5]}
      useSsaPublishedLockUi={useSsaPublishedLockUi}
    />
  );
}
