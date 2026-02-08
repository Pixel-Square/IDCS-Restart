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
      label={config.label}
      coA={config.coA}
      coB={config.coB}
      viewerMode={Boolean(viewerMode)}
      itemLabel="Content"
      itemLabelPlural="Content"
      itemAbbrev="C"
      ciaExamAvailable={false}
      absentEnabled={true}
      autoSaveDraft={true}
    />
  );
}
