/**
 * BypassContext — shared state for an admin bypass session.
 * Provides session details and helpers to all children.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import fetchWithAuth from '../../../../services/fetchAuth';

export interface BypassSessionInfo {
  session_id: string;
  ta_id: number;
  course_code: string;
  course_name: string;
  section_name: string;
  faculty_id: number;
  faculty_name: string;
  started_at: string;
}

interface BypassContextValue {
  session: BypassSessionInfo | null;
  setSession: (s: BypassSessionInfo | null) => void;
  addLog: (action: string, description: string, extra?: Record<string, unknown>) => Promise<void>;
  endSession: () => Promise<void>;
}

const BypassContext = createContext<BypassContextValue>({
  session: null,
  setSession: () => {},
  addLog: async () => {},
  endSession: async () => {},
});

export const BYPASS_SESSION_KEY = 'active_bypass_session';

export function BypassProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<BypassSessionInfo | null>(null);

  // Wrapper that also persists to sessionStorage
  const setSession = useCallback((s: BypassSessionInfo | null) => {
    setSessionState(s);
    if (s) {
      try { sessionStorage.setItem(BYPASS_SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
    } else {
      try { sessionStorage.removeItem(BYPASS_SESSION_KEY); } catch { /* ignore */ }
    }
  }, []);

  const addLog = useCallback(async (
    action: string,
    description: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!session) return;
    try {
      await fetchWithAuth(`/api/academic-v2/admin/bypass/${session.session_id}/log/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, description, extra }),
      });
    } catch {
      // Non-critical; swallow
    }
  }, [session]);

  const endSession = useCallback(async () => {
    if (!session) return;
    try {
      await fetchWithAuth(`/api/academic-v2/admin/bypass/${session.session_id}/end/`, {
        method: 'POST',
      });
    } catch {
      // Swallow
    }
    setSessionState(null);
    try { sessionStorage.removeItem(BYPASS_SESSION_KEY); } catch { /* ignore */ }
  }, [session]);

  return (
    <BypassContext.Provider value={{ session, setSession, addLog, endSession }}>
      {children}
    </BypassContext.Provider>
  );
}

export function useBypass() {
  return useContext(BypassContext);
}
