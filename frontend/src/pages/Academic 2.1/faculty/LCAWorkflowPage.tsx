import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import LCAInstructionsPage from '../../lca/LCAInstructionsPage';
import fetchWithAuth from '../../../services/fetchAuth';

interface LCAWorkflowPageProps {
  courseCode?: string;
  courseName?: string;
}

export default function LCAWorkflowPage({ courseCode: propCourseCode, courseName: propCourseName }: LCAWorkflowPageProps = {}) {
  const { courseId } = useParams<{ courseId: string }>();
  const location = useLocation();

  const [fetchedCode, setFetchedCode] = useState<string>('');
  const [fetchedName, setFetchedName] = useState<string>('');

  const paramId = courseId || '';

  useEffect(() => {
    if (propCourseCode && propCourseName) return;
    if (!paramId) return;

    let mounted = true;
    fetchWithAuth(`/api/academic-v2/faculty/courses/${paramId}/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        if (data.course_code) setFetchedCode(data.course_code);
        if (data.course_name) setFetchedName(data.course_name);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [paramId, propCourseCode, propCourseName]);

  const effectiveCourseCode = propCourseCode || fetchedCode || paramId;
  const effectiveCourseName = propCourseName || (location.state as any)?.courseName || fetchedName || '';

  if (!effectiveCourseCode) {
    return (
      <div className="p-8 text-center text-slate-500">
        No course selected. Please navigate from a course.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <LCAInstructionsPage courseCode={effectiveCourseCode} courseName={effectiveCourseName} />
    </div>
  );
}
