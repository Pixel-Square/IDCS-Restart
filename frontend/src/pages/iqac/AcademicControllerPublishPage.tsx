import React, { useEffect, useMemo, useState } from 'react';

import { fetchAssessmentMasterConfig, saveAssessmentMasterConfig } from '../../services/cdapDb';
import { primeEditRequestControlConfig } from '../../utils/requestControl';

export default function AcademicControllerPublishPage(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // true  -> Regular/Basic publish (locks tables, edit request required)
  // false -> Unlimited publish (no locks, no edit requests)
  const [regularBasic, setRegularBasic] = useState<boolean>(true);
  const [cqiRegularBasic, setCqiRegularBasic] = useState<boolean>(true);
  const [markManagerRegularBasic, setMarkManagerRegularBasic] = useState<boolean>(true);
  const [loadedConfig, setLoadedConfig] = useState<any>({});

  const statusText = useMemo(() => {
    return {
      general: regularBasic
        ? 'Regular / Basic publish is ON — published exam tables will be locked and staff must use “Request Edit”.'
        : 'Unlimited publish is ON — exam tables stay editable and no edit request is required.',
      cqi: cqiRegularBasic
        ? 'Regular / Basic publish is ON — published CQI pages will use the CQI request-edit workflow.'
        : 'Unlimited publish is ON — CQI pages will not require the CQI request-edit workflow after publish.',
      markManager: markManagerRegularBasic
        ? 'Regular / Basic publish is ON — Mark Manager is locked for all exam assignments and staff must use "Request Edit" before changing mark-manager settings.'
        : 'Unlimited publish is ON — Mark Manager in all exam assignments remains editable without an edit request.',
    };
  }, [cqiRegularBasic, markManagerRegularBasic, regularBasic]);

  function resolveEnabled(cfg: any, key: string, fallback?: boolean) {
    const value = cfg?.[key];
    if (typeof value === 'boolean') return value;
    return fallback ?? true;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const cfg = await fetchAssessmentMasterConfig();
      setLoadedConfig(cfg || {});
      const generalEnabled = resolveEnabled(cfg, 'edit_requests_enabled', true);
      const cqiEnabled = resolveEnabled(cfg, 'cqi_edit_requests_enabled', generalEnabled);
      const markManagerEnabled = resolveEnabled(cfg, 'mark_manager_edit_requests_enabled', generalEnabled);
      setRegularBasic(generalEnabled);
      setCqiRegularBasic(cqiEnabled);
      setMarkManagerRegularBasic(markManagerEnabled);
      primeEditRequestControlConfig(cfg || {});
    } catch (e: any) {
      setError(e?.message || 'Failed to load publish settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(nextPartial: Record<string, boolean>) {
    setSaving(true);
    setError(null);
    try {
      const nextCfg = { ...(loadedConfig || {}), ...nextPartial };
      const saved = await saveAssessmentMasterConfig(nextCfg);
      const finalCfg = saved || nextCfg;
      setLoadedConfig(finalCfg);
      const savedGeneral = resolveEnabled(finalCfg, 'edit_requests_enabled', true);
      setRegularBasic(savedGeneral);
      setCqiRegularBasic(resolveEnabled(finalCfg, 'cqi_edit_requests_enabled', savedGeneral));
      setMarkManagerRegularBasic(resolveEnabled(finalCfg, 'mark_manager_edit_requests_enabled', savedGeneral));
      primeEditRequestControlConfig(finalCfg);
    } catch (e: any) {
      setError(e?.message || 'Failed to save publish settings.');
    } finally {
      setSaving(false);
    }
  }

  function renderToggleCard(args: {
    title: string;
    description: string;
    enabled: boolean;
    onToggle: () => void;
    status: string;
    onLabel: string;
    offLabel: string;
    details: Array<{ title: string; body: string }>;
  }) {
    const { title, description, enabled, onToggle, status, onLabel, offLabel, details } = args;
    return (
      <div style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 14, background: '#fff', minWidth: 320, flex: '1 1 420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15, color: '#111827' }}>{title}</div>
            <div style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>{description}</div>
          </div>

          <button
            type="button"
            disabled={loading || saving}
            onClick={onToggle}
            style={{
              minWidth: 220,
              height: 52,
              padding: '0 18px',
              borderRadius: 14,
              border: enabled ? '2px solid #10b981' : '2px solid #94a3b8',
              background: enabled ? '#ecfdf5' : '#f8fafc',
              color: '#111827',
              fontWeight: 900,
              fontSize: 15,
              cursor: loading || saving ? 'not-allowed' : 'pointer',
            }}
            title={enabled ? `Click to switch ${title} to Unlimited publish` : `Click to switch ${title} to Regular / Basic publish`}
          >
            {enabled ? onLabel : offLabel}
          </button>
        </div>

        <div style={{ marginTop: 12, color: '#111827', fontSize: 13 }}>{status}</div>

        <div style={{ marginTop: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>What this changes</div>
          <div style={{ color: '#374151', fontSize: 13, lineHeight: 1.5 }}>
            {details.map((item) => (
              <div key={item.title} style={{ marginTop: item.title === details[0]?.title ? 0 : 6 }}>
                <b>{item.title}</b> {item.body}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 6 }}>
      <div>
        <div>
          <h3 style={{ margin: 0 }}>PUBLISH</h3>
          <div style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
            Controls publish lock and request-edit behavior separately for exam mark-entry pages and CQI pages.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ color: '#6b7280' }}>Loading…</div>
        ) : error ? (
          <div style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</div>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {renderToggleCard({
              title: 'Exam Mark Entry',
              description: 'Applies to regular OBE mark-entry publish and request-edit flow.',
              enabled: regularBasic,
              onToggle: () => save({ edit_requests_enabled: !regularBasic }),
              status: statusText.general,
              onLabel: 'ON: Regular / Basic',
              offLabel: 'OFF: Unlimited',
              details: [
                {
                  title: 'ON (Regular/Basic):',
                  body: 'publish turns into Request Edit for locked mark-entry tables. Staff need IQAC approval to edit published marks.',
                },
                {
                  title: 'OFF (Unlimited):',
                  body: 'publish does not lock mark-entry tables globally and no edit-request approval is required.',
                },
              ],
            })}
            {renderToggleCard({
              title: 'CQI',
              description: 'Applies only to CQI publish and CQI request-edit flow.',
              enabled: cqiRegularBasic,
              onToggle: () => save({ cqi_edit_requests_enabled: !cqiRegularBasic }),
              status: statusText.cqi,
              onLabel: 'ON: CQI Regular / Basic',
              offLabel: 'OFF: CQI Unlimited',
              details: [
                {
                  title: 'ON (Regular/Basic):',
                  body: 'published CQI pages show the Request Edit workflow and staff must use that CQI flow before re-editing published data.',
                },
                {
                  title: 'OFF (Unlimited):',
                  body: 'CQI pages stay outside the CQI request-edit workflow after publish.',
                },
              ],
            })}
            {renderToggleCard({
              title: 'Mark Manager',
              description: 'Controls whether Mark Manager requires request-edit approval across all exam assignments.',
              enabled: markManagerRegularBasic,
              onToggle: () => save({ mark_manager_edit_requests_enabled: !markManagerRegularBasic }),
              status: statusText.markManager,
              onLabel: 'ON: Regular / Basic',
              offLabel: 'OFF: Unlimited',
              details: [
                {
                  title: 'ON (Regular/Basic):',
                  body: 'Mark Manager is locked for all exam assignments after confirmation. Staff must request IQAC approval before changing mark-manager settings.',
                },
                {
                  title: 'OFF (Unlimited):',
                  body: 'Mark Manager in all exam assignments remains editable without requiring an edit request from IQAC.',
                },
              ],
            })}
          </div>
        )}

        {saving && <div style={{ marginTop: 8, color: '#6b7280' }}>Saving…</div>}
      </div>
    </div>
  );
}
