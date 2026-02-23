import React from 'react';
import LabCourseMarksEntry from './LabCourseMarksEntry';
import { normalizeClassType } from '../constants/classTypes';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  assessmentKey: 'cia1' | 'cia2' | 'model';
  viewerMode?: boolean;
  classType?: string | null;
};

export default function ReviewCourseMarkEntery({ subjectId, teachingAssignmentId, assessmentKey, viewerMode, classType }: Props) {
  const normalizedClassType = normalizeClassType(classType || '');
  if (normalizedClassType && normalizedClassType !== 'PROJECT') {
    return <div style={{ color: '#6b7280' }}>Review mark entry is available only for PROJECT class type courses.</div>;
  }

  const config =
    assessmentKey === 'cia1'
      ? { label: 'CIA 1 Review', coA: 1, coB: 2 as number | null }
      : assessmentKey === 'cia2'
        ? { label: 'CIA 2 Review', coA: 3, coB: 4 as number | null }
        : { label: 'MODEL Review', coA: 5, coB: null as number | null };

  return (
    <LabCourseMarksEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey={assessmentKey}
      skipMarkManager={true}
      floatPanelOnTable={true}
      label={config.label}
      coA={config.coA}
      coB={config.coB}
      initialEnabledCos={[1, 2, 3, 4, 5]}
      viewerMode={Boolean(viewerMode)}
      itemLabel="Content"
      itemLabelPlural="Content"
      itemAbbrev="Con"
      ciaExamAvailable={true}
      absentEnabled={true}
      autoSaveDraft={true}
    />
  );
}
