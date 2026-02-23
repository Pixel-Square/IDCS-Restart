import React from 'react';
import LabCourseMarksEntry from './LabCourseMarksEntry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  assessmentKey: 'cia1' | 'cia2' | 'model';
  viewerMode?: boolean;
};

export default function ReviewEntry({ subjectId, teachingAssignmentId, assessmentKey, viewerMode }: Props) {
  const config =
    assessmentKey === 'cia1'
      ? { label: 'CIA 1 Review', coA: 1, coB: 2 }
      : assessmentKey === 'cia2'
        ? { label: 'CIA 2 Review', coA: 3, coB: 4 }
        : { label: 'MODEL Review', coA: 5, coB: null };

  return (
    <LabCourseMarksEntry
      subjectId={subjectId}
      teachingAssignmentId={teachingAssignmentId}
      assessmentKey={assessmentKey}
      skipMarkManager={true}
      // Render the published-lock panel above the table for review pages
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
