import React from 'react';
import Formative1List from './Formative1List';

type Props = {
  subjectId?: string | null;
  subject?: any | null;
  teachingAssignmentId?: number;
};

export default function Formative2List(props: Props) {
  return <Formative1List {...props} assessmentKey="formative2" skipMarkManager={true} />;
}
