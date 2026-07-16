import React, { useEffect, useState, useCallback } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { Building2, Plus, Search, Edit2, Trash2, X, Check, Globe, Phone, Mail, MapPin, Calendar, Link } from 'lucide-react';

interface College {
  id: number;
  code: string;
  name: string;
  short_name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  phone: string;
  email: string;
  website: string;
  established_year: number | null;
  logo: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const emptyForm: Omit<College, 'id' | 'created_at' | 'updated_at'> = {
  code: '',
  name: '',
  short_name: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postal_code: '',
  phone: '',
  email: '',
  website: '',
  established_year: null,
  logo: '',
  is_active: true,
};

type FormData = typeof emptyForm;

export default function CollegesPage() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<College | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchColleges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/college/colleges/?search=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error('Failed to fetch colleges');
      const data = await res.json();
      setColleges(Array.isArray(data) ? data : (data.results || []));
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchColleges(); }, [fetchColleges]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (col: College) => {
    setEditTarget(col);
    setForm({
      code: col.code,
      name: col.name,
      short_name: col.short_name,
      address: col.address,
      city: col.city,
      state: col.state,
      country: col.country,
      postal_code: col.postal_code,
      phone: col.phone,
      email: col.email,
      website: col.website,
      established_year: col.established_year,
      logo: col.logo,
      is_active: col.is_active,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm(f => ({ ...f, [name]: (e.target as HTMLInputElement).checked }));
    } else if (name === 'established_year') {
      setForm(f => ({ ...f, established_year: value ? parseInt(value) : null }));
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const url = editTarget
        ? `/api/college/colleges/${editTarget.id}/`
        : '/api/college/colleges/';
      const method = editTarget ? 'PUT' : 'POST';
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = Object.values(errData).flat().join(' ') || 'Save failed';
        setFormError(msg);
        return;
      }
      setShowModal(false);
      fetchColleges();
    } catch (e: any) {
      setFormError(e.message || 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetchWithAuth(`/api/college/colleges/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setDeleteConfirm(null);
      fetchColleges();
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl">
            <Building2 className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Colleges</h1>
            <p className="text-sm text-gray-500">{colleges.length} record{colleges.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          id="add-college-btn"
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-md hover:shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5" /> Add College
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          id="college-search"
          type="text"
          placeholder="Search by code, name, or city..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800 placeholder-gray-400"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-center">{error}</div>
      ) : colleges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <Building2 className="w-16 h-16 opacity-30" />
          <p className="text-lg font-medium">No colleges found</p>
          <p className="text-sm">Click "Add College" to create the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {colleges.map(col => (
            <div
              key={col.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-4"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
                    {col.logo ? (
                      <img src={col.logo} alt={col.code} className="w-8 h-8 object-contain rounded" />
                    ) : (
                      <Building2 className="w-6 h-6 text-blue-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md tracking-wide">{col.code}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${col.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {col.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mt-1 text-sm leading-tight truncate" title={col.name}>{col.name}</h3>
                    {col.short_name && <p className="text-xs text-gray-400 truncate">{col.short_name}</p>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    id={`edit-college-${col.id}`}
                    onClick={() => openEdit(col)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    id={`delete-college-${col.id}`}
                    onClick={() => setDeleteConfirm(col.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Card Details */}
              <div className="space-y-1.5 text-xs text-gray-500">
                {(col.city || col.state || col.country) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{[col.city, col.state, col.country].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {col.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{col.phone}</span>
                  </div>
                )}
                {col.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <a href={`mailto:${col.email}`} className="text-blue-500 hover:underline truncate">{col.email}</a>
                  </div>
                )}
                {col.website && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                    <a href={col.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline truncate">{col.website}</a>
                  </div>
                )}
                {col.established_year && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Est. {col.established_year}</span>
                  </div>
                )}
              </div>

              {/* Delete confirm inline */}
              {deleteConfirm === col.id && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-red-700 font-medium">Delete this college?</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleDelete(col.id)} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1 rounded-lg hover:bg-red-700 transition-colors">
                      <Check className="w-3.5 h-3.5" /> Yes
                    </button>
                    <button onClick={() => setDeleteConfirm(null)} className="flex items-center gap-1 text-xs bg-gray-200 text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-300 transition-colors">
                      <X className="w-3.5 h-3.5" /> No
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editTarget ? 'Edit College' : 'Add College'}
                </h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{formError}</div>
              )}

              {/* Code & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="college-form-code"
                    name="code"
                    value={form.code}
                    onChange={handleChange}
                    required
                    placeholder="e.g. IDCS"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">Short college code (e.g. IDCS)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="college-form-name"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    placeholder="Full college name"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              {/* Short Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Short Name</label>
                <input
                  id="college-form-short-name"
                  name="short_name"
                  value={form.short_name}
                  onChange={handleChange}
                  placeholder="Optional short display name"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                <textarea
                  id="college-form-address"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Street address..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                />
              </div>

              {/* City, State, Country */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                  <input id="college-form-city" name="city" value={form.city} onChange={handleChange} placeholder="City" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
                  <input id="college-form-state" name="state" value={form.state} onChange={handleChange} placeholder="State" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
                  <input id="college-form-country" name="country" value={form.country} onChange={handleChange} placeholder="Country" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>

              {/* Postal & Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Postal Code</label>
                  <input id="college-form-postal" name="postal_code" value={form.postal_code} onChange={handleChange} placeholder="Postal code" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                  <input id="college-form-phone" name="phone" value={form.phone} onChange={handleChange} placeholder="Phone number" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input id="college-form-email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="contact@college.edu" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>

              {/* Website, Est Year, Logo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
                  <input id="college-form-website" name="website" type="url" value={form.website} onChange={handleChange} placeholder="https://..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Established Year</label>
                  <input id="college-form-year" name="established_year" type="number" value={form.established_year ?? ''} onChange={handleChange} placeholder="e.g. 1998" min={1800} max={new Date().getFullYear()} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo</label>
                  <input id="college-form-logo" name="logo" value={form.logo} onChange={handleChange} placeholder="Path or URL to logo" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Path or URL to logo image</p>
                </div>
              </div>

              {/* Is Active */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <input
                  id="college-form-active"
                  name="is_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={handleChange}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label htmlFor="college-form-active" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Is Active
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="college-form-submit"
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 shadow-md"
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                  ) : (
                    <><Check className="w-4 h-4" /> {editTarget ? 'Update College' : 'Save College'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
