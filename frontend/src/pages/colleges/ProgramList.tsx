import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Edit, Trash2, Building2 } from 'lucide-react';
import { useSearchParams, Link, useNavigate, useParams } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';

interface Program {
  id: number;
  name: string;
  college: number;
}

export default function ProgramList() {
  const { id: collegeId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [formData, setFormData] = useState({ name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrograms();
  }, [collegeId]);

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const url = `/api/college/programs/${collegeId ? `?college_id=${collegeId}` : ''}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error('Failed to fetch programs');
      setPrograms(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (p?: Program) => {
    setFormError(null);
    if (p) {
      setEditingProgram(p);
      setFormData({ name: p.name });
    } else {
      setEditingProgram(null);
      setFormData({ name: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const method = editingProgram ? 'PUT' : 'POST';
      const url = editingProgram 
        ? `/api/college/programs/${editingProgram.id}/` 
        : `/api/college/programs/`;
      
      const payload = {
        name: formData.name,
        college: collegeId ? Number(collegeId) : null
      };

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save program');
      }
      setShowModal(false);
      fetchPrograms();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this program?')) return;
    try {
      const res = await fetchWithAuth(`/api/college/programs/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete program');
      setPrograms(prev => prev.filter(p => p.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(collegeId ? `/colleges/${collegeId}` : '/colleges')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
            <p className="text-sm text-gray-500">Manage academic programs (e.g. B.Tech, MBA)</p>
          </div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Add Program
        </button>
      </div>

      {collegeId && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-6 flex items-center gap-2 text-indigo-800">
          <Building2 className="w-5 h-5 text-indigo-600" />
          <span className="text-sm font-medium">Viewing programs scoped to College ID: {collegeId}</span>
        </div>
      )}

      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg font-medium">Error: {error}</div>
      ) : loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : programs.length === 0 ? (
        <div className="text-center p-12 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-gray-500 font-medium">No programs found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-sm font-semibold text-gray-700">Name</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {programs.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{p.name}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleOpenModal(p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-2">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">{editingProgram ? 'Edit Program' : 'Add Program'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              {formError && (
                <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm">{formError}</div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Program Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. B.Tech"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
