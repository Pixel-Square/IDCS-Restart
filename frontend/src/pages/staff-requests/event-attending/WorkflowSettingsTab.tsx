import React, { useState, useEffect } from 'react';
import type { EventWorkflowRule } from '../../../types/eventAttending';
import { fetchEventWorkflowSettings, saveEventWorkflowSettings } from '../../../services/eventAttending';
import { Plus, Trash2, Save, RefreshCw, Settings } from 'lucide-react';

const ROLE_OPTIONS = ['STAFF', 'AHOD', 'HOD', 'IQAC', 'HAA', 'PRINCIPAL', 'HR', 'PS', 'ADMIN'];

export default function WorkflowSettingsTab() {
  const [rules, setRules] = useState<EventWorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRules(await fetchEventWorkflowSettings()); } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const grouped = rules.reduce<Record<string, EventWorkflowRule[]>>((acc, r) => {
    (acc[r.applicant_role] = acc[r.applicant_role] || []).push(r);
    return acc;
  }, {});

  const addRule = (applicantRole: string) => {
    const existing = rules.filter(r => r.applicant_role === applicantRole);
    const nextStep = existing.length ? Math.max(...existing.map(r => r.step_order)) + 1 : 1;
    setRules([...rules, { applicant_role: applicantRole, step_order: nextStep, approver_role: '', is_active: true }]);
  };

  const updateRule = (idx: number, updates: Partial<EventWorkflowRule>) => {
    const n = [...rules]; n[idx] = { ...n[idx], ...updates }; setRules(n);
  };

  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      await saveEventWorkflowSettings(rules.filter(r => r.applicant_role && r.approver_role));
      setMsg('Workflow settings saved successfully');
      load();
    } catch { setMsg('Failed to save'); }
    finally { setSaving(false); }
  };

  const addNewApplicantRole = () => {
    const role = window.prompt('Enter applicant role (e.g. STAFF, HOD):');
    if (role && role.trim()) addRule(role.trim().toUpperCase());
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2"><Settings size={18} /> Approval Workflow Configuration</h3>
        <div className="flex gap-2">
          <button onClick={addNewApplicantRole} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"><Plus size={14} /> Add Role Group</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </div>

      {msg && <div className="p-2 bg-green-50 border border-green-200 rounded text-green-700 text-sm text-center">{msg}</div>}

      <p className="text-xs text-gray-500">Configure which roles approve event attending forms at each step. Each group defines the workflow for a specific applicant role.</p>

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([applicantRole, roleRules]) => (
        <div key={applicantRole} className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-blue-700">When applicant is: <span className="bg-blue-100 px-2 py-0.5 rounded">{applicantRole}</span></h4>
            <button onClick={() => addRule(applicantRole)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus size={12} /> Add Step</button>
          </div>
          <div className="space-y-2">
            {roleRules.sort((a, b) => a.step_order - b.step_order).map(rule => {
              const globalIdx = rules.findIndex(r => r === rule);
              return (
                <div key={globalIdx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2">
                  <span className="text-xs font-mono text-gray-400 w-16">Step {rule.step_order}</span>
                  <span className="text-xs text-gray-500">→</span>
                  <select value={rule.approver_role} onChange={e => updateRule(globalIdx, { approver_role: e.target.value })}
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500">
                    <option value="">Select role...</option>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    <input type="checkbox" checked={rule.is_active} onChange={e => updateRule(globalIdx, { is_active: e.target.checked })} className="w-3.5 h-3.5" />
                    Active
                  </label>
                  <button onClick={() => removeRule(globalIdx)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p>No workflow rules configured. Click "Add Role Group" to start.</p>
        </div>
      )}
    </div>
  );
}
