import React, { useState, useEffect } from 'react';
import {
  Plus,
  ArrowRight,
  UserCheck,
  Award,
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  GitFork
} from 'lucide-react';
import {
  fetchDisciplineFlow,
  updateDisciplineFlow
} from '../../../services/discipline';

export default function FlowPage() {
  // Intermediate roles between Submitter and Finalizer
  const [intermediateRoles, setIntermediateRoles] = useState<string[]>(['DISCIPLINE_COMMITTEE', 'HOD']);
  // Customizable Finalizer / Approver role
  const [finalRole, setFinalRole] = useState<string>('PRINCIPAL');
  const [availableRoles, setAvailableRoles] = useState<string[]>([
    'DISCIPLINE_COMMITTEE',
    'MENTOR',
    'ADVISOR',
    'HOD',
    'AHOD',
    'DEAN',
    'PRINCIPAL',
    'VICE_PRINCIPAL',
    'DISCIPLINE_COMMITTEE_ADMIN',
    'IQAC',
  ]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadFlow();
  }, []);

  const loadFlow = async () => {
    setLoading(true);
    try {
      const data = await fetchDisciplineFlow();
      if (data && data.flow && Array.isArray(data.flow.roles) && data.flow.roles.length > 0) {
        const roles = data.flow.roles;
        if (roles.length === 1) {
          setIntermediateRoles([]);
          setFinalRole(roles[0]);
        } else {
          setIntermediateRoles(roles.slice(0, roles.length - 1));
          setFinalRole(roles[roles.length - 1]);
        }
      }
      if (data && data.available_roles && data.available_roles.length > 0) {
        setAvailableRoles(data.available_roles);
      }
    } catch (err: any) {
      console.error('Failed to load flow:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      // Complete flow ladder: intermediate roles leading to finalizer role
      const fullRoles = [...intermediateRoles, finalRole];
      await updateDisciplineFlow({
        name: 'Standard Discipline Approval Flow',
        roles: fullRoles,
      });
      setStatusMessage({
        type: 'success',
        text: 'Flow saved successfully!',
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Save error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to save flow.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setIntermediateRoles(['DISCIPLINE_COMMITTEE', 'HOD']);
    setFinalRole('PRINCIPAL');
    setStatusMessage({
      type: 'success',
      text: 'Reset to default (Submitter ➔ DISCIPLINE_COMMITTEE ➔ HOD ➔ PRINCIPAL). Click Save to apply.',
    });
  };

  const handleAddIntermediateRole = (index?: number) => {
    // Pick first unused or standard role
    const defaultNewRole = availableRoles.find(r => !intermediateRoles.includes(r) && r !== finalRole) || 'MENTOR';
    const updated = [...intermediateRoles];
    if (typeof index === 'number') {
      updated.splice(index, 0, defaultNewRole);
    } else {
      updated.push(defaultNewRole);
    }
    setIntermediateRoles(updated);
  };

  const handleRemoveIntermediateRole = (index: number) => {
    setIntermediateRoles(intermediateRoles.filter((_, i) => i !== index));
  };

  const handleUpdateIntermediateRole = (index: number, newRole: string) => {
    const updated = [...intermediateRoles];
    updated[index] = newRole;
    setIntermediateRoles(updated);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in duration-200">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <GitFork className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Incident Forwarding Flow
            </h1>
            <p className="text-xs text-slate-500">
              Horizontal approval ladder from Submitter to Finalizer.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm shadow-indigo-200 active:scale-95 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Flow'}</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl flex items-center gap-2 text-xs font-bold border animate-in slide-in-from-top-1 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="flex-1">{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* ── CLEAN HORIZONTAL FLOW LINE ── */}
      <div className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-xs overflow-x-auto scrollbar-thin">
        <div className="min-w-max flex items-center justify-start py-6 px-4">
          {/* 1. START NODE: SUBMITTER */}
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white flex items-center justify-center font-black shadow-md shadow-emerald-200 border-2 border-white ring-2 ring-emerald-400/80 shrink-0">
              <UserCheck className="w-7 h-7" />
            </div>
            <div className="text-center">
              <div className="text-xs font-black text-slate-900 tracking-tight">Submitter</div>
              <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 mt-0.5 inline-block">
                Start Node
              </div>
            </div>
          </div>

          {/* CONNECTOR 1: Forwarded to first role & Add button */}
          <div className="flex items-center mx-1">
            <div className="h-0.5 w-6 sm:w-10 bg-slate-300" />

            <div className="flex flex-col items-center gap-1.5 px-1">
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold rounded-full shadow-2xs flex items-center gap-1 whitespace-nowrap">
                Forwarded to {intermediateRoles[0] || finalRole} <ArrowRight className="w-3 h-3 text-indigo-500" />
              </span>

              <button
                onClick={() => handleAddIntermediateRole(0)}
                title="Add role here"
                className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-dashed border-indigo-300 text-indigo-600 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition shadow-2xs cursor-pointer active:scale-95"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </div>

            <div className="h-0.5 w-6 sm:w-10 bg-slate-300" />
          </div>

          {/* 2. IN-BETWEEN INTERMEDIATE ROLES */}
          {intermediateRoles.map((role, idx) => (
            <React.Fragment key={`role-${idx}`}>
              <div className="flex flex-col items-center gap-2.5 relative">
                {/* Node circle */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-black shadow-md shadow-indigo-200 border-2 border-white ring-2 ring-indigo-400/80 relative shrink-0">
                  <ShieldCheck className="w-7 h-7" />

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveIntermediateRole(idx)}
                    title="Remove this role"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-black shadow-xs cursor-pointer transition active:scale-90"
                  >
                    ×
                  </button>
                </div>

                {/* Role Dropdown */}
                <div className="text-center">
                  <select
                    value={role}
                    onChange={(e) => handleUpdateIntermediateRole(idx, e.target.value)}
                    className="text-xs font-black text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer shadow-2xs max-w-[140px]"
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                    Step {idx + 1}
                  </div>
                </div>
              </div>

              {/* CONNECTOR: Forwarded to next role & Add button */}
              <div className="flex items-center mx-1">
                <div className="h-0.5 w-6 sm:w-10 bg-slate-300" />

                <div className="flex flex-col items-center gap-1.5 px-1">
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold rounded-full shadow-2xs flex items-center gap-1 whitespace-nowrap">
                    Forwarded to {idx + 1 < intermediateRoles.length ? intermediateRoles[idx + 1] : finalRole} <ArrowRight className="w-3 h-3 text-indigo-500" />
                  </span>

                  <button
                    onClick={() => handleAddIntermediateRole(idx + 1)}
                    title="Add role here"
                    className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-dashed border-indigo-300 text-indigo-600 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition shadow-2xs cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>

                <div className="h-0.5 w-6 sm:w-10 bg-slate-300" />
              </div>
            </React.Fragment>
          ))}

          {/* 3. FINAL NODE: CUSTOMIZABLE FINALIZER / APPROVER */}
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-purple-700 text-white flex items-center justify-center font-black shadow-md shadow-violet-200 border-2 border-white ring-2 ring-violet-400/80 shrink-0">
              <Award className="w-7 h-7" />
            </div>

            <div className="text-center">
              {/* Customizable Finalizer Role Dropdown as requested */}
              <select
                value={finalRole}
                onChange={(e) => setFinalRole(e.target.value)}
                className="text-xs font-black text-violet-950 bg-violet-50 hover:bg-violet-100 border border-violet-300 rounded-lg px-2.5 py-1 focus:ring-2 focus:ring-violet-500 focus:outline-hidden cursor-pointer shadow-2xs max-w-[140px]"
              >
                {availableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <div className="text-[10px] font-extrabold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200 mt-0.5 inline-block">
                Finalizer / Approver
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
