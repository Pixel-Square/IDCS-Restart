import React from 'react';
import Cia1Entry from './Cia1Entry';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  classType?: string | null;
  questionPaperType?: string | null;
  customQuestions?: Array<{ key: string; label: string; max: number; co: any; btl: number }> | null;
};

export default function Cia2Entry(props: Props) {
  return <Cia1Entry {...props} assessmentKey="cia2" />;
}
