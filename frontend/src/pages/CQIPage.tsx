import React from 'react';
import C1CQIPage from './C1CQIPage';

type Props = {
  courseId: string;
};

export default function CQIPage({ courseId }: Props): JSX.Element {
  return <C1CQIPage courseId={courseId} />;
}
