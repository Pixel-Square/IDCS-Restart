import React from 'react';
import Formative1List from './Formative1List';

type Props = {
  subjectId?: string | null;
  subject?: any | null;
  teachingAssignmentId?: number;
  classType?: string | null;
  questionPaperType?: string | null;
};

export default function Formative2List(props: Props) {
  return <Formative1List {...props} assessmentKey="formative2" />;
}
