import React, { useState, useEffect } from 'react';
import type { StaffDeclaration } from '../../../types/eventAttending';
import { fetchStaffDeclarations, saveStaffDeclaration, applyAllDeclaration } from '../../../services/eventAttending';
import { Save, RefreshCw, Users } from 'lucide-react';

export default function StaffDeclarationTab() {
  const [declarations, setDeclarations] = useState<StaffDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, { normal: number; conf: number }>>({});
  const [applyVal, setApplyVal] = useState({ normal: 0, conf: 0 });
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [desigFilter, setDesigFilter] = useState('');
  const [expFilter, setExpFilter] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchStaffDeclarations();
      setDeclarations(data);
      const e: Record<number, { normal: number; conf: number }> = {};
      data.forEach(d => { e[d.user_id] = { normal: d.normal_events_budget, conf: d.conference_budget }; });
      setEdits(e);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (d: StaffDeclaration) => {
    const edit = edits[d.user_id];
    if (!edit) return;
    setSaving(d.user_id); setMsg('');
    try {
      await saveStaffDeclaration(d.user_id, edit.normal, edit.conf);
      setMsg(`Saved for ${d.staff_name}`);
      load();
    } catch { setMsg('Save failed'); }
    finally { setSaving(null); }
  };

  const handleApplyAll = async (col: 'normal_events_budget' | 'conference_budget') => {
    const val = col === 'normal_events_budget' ? applyVal.normal : applyVal.conf;
    if (!window.confirm(`Set ${col === 'normal_events_budget' ? 'Normal Events' : 'Conference'} budget to ₹${val} for ALL currently filtered staff?`)) return;
    setMsg('');
    
    // Applying to all currently filtered staff!
    let successCount = 0;
    try {
      // Instead of the apply_all endpoint which does ALL staff in the DB,
      // we'll loop over filtered staff since user might want to apply only to 'CSE' or 'Above 2 yrs'.
      // Note: If they want to apply to ALL DB staff, it's safer to just iterate and save.
      const promises = filtered.map(d => saveStaffDeclaration(d.user_id, col === 'normal_events_budget' ? val : d.normal_events_budget, col === 'conference_budget' ? val : d.conference_budget));
      await Promise.all(promises);
      setMsg(`Applied to ${filtered.length} staff`);
      load();
    } catch { setMsg('Failed to apply to some staff'); }
  };

  const filtered = declarations.filter(d => {
    const s = search.toLowerCase();
    if (search && !(d.staff_name.toLowerCase().includes(s) || d.staff_id_display.toLowerCase().includes(s))) return false;
    if (deptFilter && d.department_name !== deptFilter) return false;
    if (desigFilter && d.designation !== desigFilter) return false;
    if (expFilter === '<2' && d.experience_years >= 2) return false;
    if (expFilter === '>=2' && d.experience_years < 2) return false;
    return true;
  });

  const departments = Array.from(new Set(declarations.map(d => d.department_name).filter(Boolean))).sort();
  const designations = Array.from(new Set(declarations.map(d => d.designation).filter(Boolean))).sort();

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Apply All */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2"><Users size={16} /> Apply Budget to Filtered Staff</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Normal Events (₹)</label>
              <input type="number" value={applyVal.normal || ''} onChange={e => setApplyVal(p => ({ ...p, normal: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <button onClick={() => handleApplyAll('normal_events_budget')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap">Apply to Filtered</button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Conference (₹)</label>
              <input type="number" value={applyVal.conf || ''} onChange={e => setApplyVal(p => ({ ...p, conf: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <button onClick={() => handleApplyAll('conference_budget')} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 whitespace-nowrap">Apply to Filtered</button>
          </div>
        </div>
      </div>

      {msg && <div className="p-2 bg-green-50 border border-green-200 rounded text-green-700 text-sm text-center">{msg}</div>}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-4 border border-gray-200 rounded-xl">
        <input type="text" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
        
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        
        <select value={desigFilter} onChange={e => setDesigFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          <option value="">All Designations</option>
          {designations.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        
        <select value={expFilter} onChange={e => setExpFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          <option value="">All Experience</option>
          <option value="<2">Less than 2 yrs</option>
          <option value=">=2">2 yrs and above</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">S.No</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Staff ID</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Name</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Department</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Designation</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Exp. (yrs)</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Normal Events (₹)</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Conference (₹)</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={d.user_id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{d.staff_id_display}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{d.staff_name}</td>
                  <td className="px-3 py-2 text-gray-600">{d.department_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{d.designation || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{d.experience_years}</td>
                  <td className="px-3 py-2">
                    <input type="number" value={edits[d.user_id]?.normal ?? ''} onChange={e => setEdits(p => ({ ...p, [d.user_id]: { ...p[d.user_id], normal: Number(e.target.value) || 0 } }))}
                      className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={edits[d.user_id]?.conf ?? ''} onChange={e => setEdits(p => ({ ...p, [d.user_id]: { ...p[d.user_id], conf: Number(e.target.value) || 0 } }))}
                      className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => handleSave(d)} disabled={saving === d.user_id}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50">
                      {saving === d.user_id ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
