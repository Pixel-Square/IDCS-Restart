import { useEffect, useState } from 'react';

import { fetchAssessmentMasterConfig } from '../services/cdapDb';

// Module-level cache so all component instances share a single fetch result.
let _cachedConfig: any | null = null;
let _pendingPromise: Promise<any> | null = null;

function _resolveFlagFromConfig(cfg: any, key: string, fallbackKey?: string): boolean {
  const direct = cfg?.[key];
  if (typeof direct === 'boolean') return direct;

  if (fallbackKey) {
    const fallback = cfg?.[fallbackKey];
    if (typeof fallback === 'boolean') return fallback;
  }

  return true;
}

async function _resolveConfig(): Promise<any> {
  if (_pendingPromise) return _pendingPromise;
  _pendingPromise = fetchAssessmentMasterConfig()
    .then((cfg) => {
      return cfg && typeof cfg === 'object' ? cfg : {};
    })
    .catch(() => ({}))
    .then((result) => {
      _cachedConfig = result;
      _pendingPromise = null;
      return result;
    });
  return _pendingPromise;
}

function useEditRequestFlag(key: string, fallbackKey?: string): boolean {
  const [enabled, setEnabled] = useState<boolean>(_resolveFlagFromConfig(_cachedConfig, key, fallbackKey));

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      _pendingPromise = null;
      _resolveConfig().then((cfg) => {
        if (!cancelled) setEnabled(_resolveFlagFromConfig(cfg, key, fallbackKey));
      });
    };

    _resolveConfig().then((cfg) => {
      if (!cancelled) setEnabled(_resolveFlagFromConfig(cfg, key, fallbackKey));
    });

    // Refresh every 60s so IQAC config changes propagate quickly across users
    // (was 5 min — too slow when two faculty are coordinating on the same
    // course/TA).
    const tid = window.setInterval(refresh, 60 * 1000);

    // Also invalidate immediately when sibling tabs publish or reset a CQI
    // page — the same events the dashboards already listen to.
    window.addEventListener('obe:published', refresh);
    window.addEventListener('obe:reset', refresh);

    return () => {
      cancelled = true;
      window.clearInterval(tid);
      window.removeEventListener('obe:published', refresh);
      window.removeEventListener('obe:reset', refresh);
    };
  }, [fallbackKey, key]);

  return enabled;
}

export function primeEditRequestControlConfig(config: any): void {
  _cachedConfig = config && typeof config === 'object' ? config : {};
  _pendingPromise = null;
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
  return useEditRequestFlag('edit_requests_enabled');
}

/**
 * Returns whether the IQAC-controlled CQI edit-request flow is enabled.
 *
 * - When `cqi_edit_requests_enabled` is explicitly configured, that value is used.
 * - Otherwise it safely falls back to the shared `edit_requests_enabled` value,
 *   preserving prior behavior for existing deployments.
 */
export function useCqiEditRequestsEnabled(): boolean {
  return useEditRequestFlag('cqi_edit_requests_enabled', 'edit_requests_enabled');
}

/**
 * Returns whether the IQAC-controlled Mark Manager edit-request flow is enabled
 * across all exam assignments.
 *
 * - When `mark_manager_edit_requests_enabled` is explicitly configured, that value is used.
 * - Otherwise it safely falls back to the shared `edit_requests_enabled` value,
 *   preserving prior behavior for existing deployments.
 */
export function useMarkManagerEditRequestsEnabled(): boolean {
  return useEditRequestFlag('mark_manager_edit_requests_enabled', 'edit_requests_enabled');
}
