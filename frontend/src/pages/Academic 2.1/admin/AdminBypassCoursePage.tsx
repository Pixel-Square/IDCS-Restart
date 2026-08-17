/**
 * AdminBypassCoursePage — wraps the faculty's InternalMarkPage in bypass mode.
 * Includes the pinned bypass header with all admin controls.
 * The bypass parameter (session_id) comes from the URL.
 */
import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BypassProvider, useBypass, BypassSessionInfo } from './bypass/BypassContext';
import BypassHeader from './bypass/BypassHeader';
import InternalMarkPageBypass from './bypass/InternalMarkPageBypass';
import fetchWithAuth from '../../../services/fetchAuth';

function InnerBypassPage() {
  const { sessionId, courseId } = useParams<{ sessionId: string; courseId: string }>();
  const navigate = useNavigate();
  const { session, setSession, addLog, endSession } = useBypass();
  const bootstrapped = useRef(false);

  // Initialise session state from URL params on first render
  useEffect(() => {
    if (bootstrapped.current || !sessionId || !courseId) return;
    bootstrapped.current = true;

    // 1. Try sessionStorage first (populated by BypassShareLandingPage for faculty-shared links,
    //    or by BypassContext when admin navigates normally)
    try {
      const raw = sessionStorage.getItem('active_bypass_session');
      if (raw) {
        const cached = JSON.parse(raw) as BypassSessionInfo;
        if (cached.session_id === sessionId) {
          setSession(cached);
          return;
        }
      }
    } catch { /* ignore */ }

    // 2. Fall back to the detail endpoint — accessible to admin OR the target faculty user
    fetchWithAuth(`/api/academic-v2/admin/bypass/${sessionId}/detail/`)
      .then((r) => r.json())
      .then((s: any) => {
        if (s && s.id) {
          const info: BypassSessionInfo = {
            session_id: s.id,
            ta_id: s.teaching_assignment_id,
            course_code: s.course_code,
            course_name: s.course_name,
            section_name: s.section_name,
            faculty_id: s.faculty?.id || 0,
            faculty_name: s.faculty?.name || 'Unknown',
            started_at: s.started_at,
          };
          setSession(info);
        }
      })
      .catch(() => {});
  }, [sessionId, courseId, setSession]);

  const handleExit = async () => {
    await endSession();
    navigate('/academic-v2/admin/course-manager');
  };

  // Auto-exit when the browser tab is closed/reloaded without clicking Exit
  useEffect(() => {
    const handleUnload = () => {
      if (!session?.session_id) return;
      const token = localStorage.getItem('access');
      if (!token) return;
      // keepalive: true ensures the request completes even after page unload
      fetch(`/api/academic-v2/admin/bypass/${session.session_id}/end/`, {
        method: 'POST',
        keepalive: true,
        headers: { Authorization: `Bearer ${token}` },
      });
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [session?.session_id]);

  const handleResetCourse = async () => {
    if (!sessionId) return;
    const res = await fetchWithAuth(
      `/api/academic-v2/admin/bypass/${sessionId}/reset-course/`,
      { method: 'POST' },
    );
    if (res.ok) {
      // Backend already logs the RESET_COURSE action — no need to addLog here
      // Reload the inner page by forcing a key change
      window.location.reload();
    }
  };

  return (
    <div>
      <BypassHeader onExit={handleExit} onResetCourse={handleResetCourse} />
      {/* Render the regular InternalMarkPage but with bypass props */}
      {courseId && <InternalMarkPageBypass courseId={courseId} sessionId={sessionId!} />}
    </div>
  );
}

export default function AdminBypassCoursePage() {
  return (
    <BypassProvider>
      <InnerBypassPage />
    </BypassProvider>
  );
}
