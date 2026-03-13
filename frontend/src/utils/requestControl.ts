import { useEffect, useState } from 'react';

import { fetchAssessmentMasterConfig } from '../services/cdapDb';

// Module-level cache so all component instances share a single fetch result.
let _cachedEnabled: boolean | null = null;
let _pendingPromise: Promise<boolean> | null = null;

async function _resolveEnabled(): Promise<boolean> {
  if (_pendingPromise) return _pendingPromise;
  _pendingPromise = fetchAssessmentMasterConfig()
    .then((cfg) => {
      const val = (cfg as any)?.edit_requests_enabled;
      // Default to true (enabled) when the field is absent or not explicitly false.
      return val === false ? false : true;
    })
    .catch(() => true)
    .then((result) => {
      _cachedEnabled = result;
      _pendingPromise = null;
      return result;
    });
  return _pendingPromise;
}

/**
 * Returns whether the IQAC-controlled "mark entry edit requests" feature is enabled.
 *
 * - true  → published marks are locked; staff must request IQAC approval to edit.
 * - false → IQAC has disabled the edit-request flow; published lock is bypassed.
 *
 * The value is read from `edit_requests_enabled` inside the OBE assessment master
 * config (managed by IQAC via the Academic Controller page).  Defaults to true
 * when not explicitly configured, preserving existing behavior.
 */
export function useMarkEntryEditRequestsEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(_cachedEnabled ?? true);

  useEffect(() => {
    let cancelled = false;

    _resolveEnabled().then((val) => {
      if (!cancelled) setEnabled(val);
    });

    // Refresh every 5 minutes so IQAC changes propagate without a hard reload.
    const tid = window.setInterval(() => {
      _pendingPromise = null;
      _resolveEnabled().then((val) => {
        if (!cancelled) setEnabled(val);
      });
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(tid);
    };
  }, []);

  return enabled;
}
