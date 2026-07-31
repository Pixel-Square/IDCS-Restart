import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, RefreshCw, AlertCircle, Calendar } from 'lucide-react';
import type { EventBudgetCondition, AcademicCalendarInfo, ExpCondition, EventType } from '../../../types/eventAttending';
import {
  fetchEventBudgetConditions,
  saveEventBudgetConditions,
  fetchActiveAcademicCalendar,
  fetchStaffDeclarations
} from '../../../services/eventAttending';

const EXP_CONDITIONS: ExpCondition[] = ['>', '>=', '<', '<=', '=='];

export default function ConditionsTab() {
  const [conditions, setConditions] = useState<EventBudgetCondition[]>([]);
  const [academicCal, setAcademicCal] = useState<AcademicCalendarInfo | null>(null);
  const [designations, setDesignations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [conds, cal, stf] = await Promise.all([
        fetchEventBudgetConditions(),
        fetchActiveAcademicCalendar(),
        fetchStaffDeclarations()
      ]);
      setConditions(conds);
      setAcademicCal(cal);
      const desigs = Array.from(new Set(stf.map(d => d.designation).filter(Boolean))).sort();
      setDesignations(desigs.length > 0 ? desigs : ['PROFESSOR', 'ASSOCIATE PROFESSOR', 'ASSISTANT PROFESSOR']);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const addCondition = (type: EventType) => {
    const from_date = academicCal?.from_date || '';
    const to_date = academicCal?.to_date || '';
    setConditions([
      ...conditions,
      {
        event_type: type,
        designation: designations[0] || '',
        exp_condition: '>=',
        exp_value: 0,
        amount: 0,
        from_date,
        to_date,
        is_active: true
      }
    ]);
  };

  const updateCondition = (index: number, updates: Partial<EventBudgetCondition>) => {
    const newConds = [...conditions];
    newConds[index] = { ...newConds[index], ...updates };
    setConditions(newConds);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    setError('');
    
    // Validate
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      if (!c.designation) {
        setError(`Condition #${i + 1} is missing a designation.`);
        setSaving(false);
        return;
      }
      if (!c.from_date || !c.to_date) {
        setError(`Condition #${i + 1} is missing from/to dates.`);
        setSaving(false);
        return;
      }
    }

    try {
      const res = await saveEventBudgetConditions(conditions);
      setMsg(res.message || 'Saved successfully');
      const updated = await fetchEventBudgetConditions();
      setConditions(updated);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save conditions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const normalConds = conditions.filter(c => c.event_type === 'normal');
  const confConds = conditions.filter(c => c.event_type === 'conference');

  const renderTable = (type: EventType, condsList: EventBudgetCondition[]) => (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
        <h4 className="text-sm font-semibold text-gray-800">
          {type === 'normal' ? 'Normal Events Conditions' : 'Conference Events Conditions'}
        </h4>
        <button 
          onClick={() => addCondition(type)} 
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Plus size={14} /> Add Condition for {type === 'normal' ? 'Normal Events' : 'Conference Events'}
        </button>
      </div>
      
      {condsList.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          No conditions added yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Designation</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-24">Operator</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-32">Experience (Yrs)</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-32">Amount (₹)</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-40">From Date</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-40">To Date</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((c, idx) => {
                if (c.event_type !== type) return null;
                return (
                  <tr key={idx} className="border-b hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2">
                      <select 
                        value={c.designation} 
                        onChange={e => updateCondition(idx, { designation: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">Select Designation...</option>
                        {designations.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select 
                        value={c.exp_condition} 
                        onChange={e => updateCondition(idx, { exp_condition: e.target.value as ExpCondition })}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {EXP_CONDITIONS.map(cond => <option key={cond} value={cond}>{cond}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="number" step="0.1"
                        value={c.exp_value} 
                        onChange={e => updateCondition(idx, { exp_value: Number(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        title="e.g. 2.2 for 2 years 2 months"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="number" 
                        value={c.amount} 
                        onChange={e => updateCondition(idx, { amount: Number(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="date" 
                        value={c.from_date} 
                        onChange={e => updateCondition(idx, { from_date: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="date" 
                        value={c.to_date} 
                        onChange={e => updateCondition(idx, { to_date: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button 
                        onClick={() => removeCondition(idx)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove condition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <AlertCircle size={18} className="text-blue-600" /> 
            Rule-Based Budget Conditions
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Define conditions based on designation and experience to automatically apply budgets to staff members. 
            Higher experience thresholds will override lower ones for the same designation.
          </p>
        </div>
        
        <button 
          onClick={handleSave} 
          disabled={saving} 
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />} 
          Save & Apply to Staff Declaration
        </button>
      </div>

      {academicCal?.name && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
          <Calendar size={16} className="text-blue-600" />
          <span>Active Academic Calendar: <strong>{academicCal.name}</strong> ({academicCal.from_date} to {academicCal.to_date})</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      
      {msg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center font-medium">
          {msg}
        </div>
      )}

      {renderTable('normal', normalConds)}
      {renderTable('conference', confConds)}
      
    </div>
  );
}
