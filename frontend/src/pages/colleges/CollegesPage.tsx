import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { Building2, Plus, Search, Edit2, Trash2, X, Check, Globe, Phone, Mail, MapPin, Calendar, ChevronRight, Image as ImageIcon, Upload, ArrowRight, ShieldCheck, Zap, Star } from 'lucide-react';
import ConfirmPasswordDeleteModal from '../../components/ConfirmPasswordDeleteModal';

interface FeatureItem {
  code: string;
  name: string;
  description: string;
  category: string;
}

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
  logo_url?: string | null;
  banner_url?: string | null;
  is_active: boolean;
  tier?: 'BASIC' | 'PRO' | 'PREMIUM';
  created_at: string;
  updated_at: string;
  admin_username?: string;
  admin_email?: string;
  admin_password?: string;
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
  admin_username: '',
  admin_email: '',
  admin_password: '',
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
  const [step, setStep] = useState<1 | 2>(1);
  const [featuresList, setFeaturesList] = useState<FeatureItem[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  // Image file state for create/edit modal
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

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

    const fetchFeaturesList = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/accounts/features/');
      if (res.ok) setFeaturesList(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchColleges(); fetchFeaturesList(); }, [fetchColleges, fetchFeaturesList]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setLogoFile(null);
    setBannerFile(null);
    setFormError(null);
    setStep(1);
    setSelectedFeatures([]);
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
      logo: col.logo_url || col.logo || '',
      is_active: col.is_active,
      admin_username: '',
      admin_email: '',
      admin_password: '',
    });
    setLogoFile(null);
    setBannerFile(null);
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

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name) {
      setFormError('Code and Name are required.');
      return;
    }
    setFormError(null);
    if (!editTarget) {
      setStep(2);
    } else {
      // Editing existing just submits
      submitData();
    }
  };

  const submitData = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const url = editTarget
        ? `/api/college/colleges/${editTarget.id}/`
        : '/api/college/colleges/';
      const method = editTarget ? 'PUT' : 'POST';

      let res: Response;
      if (logoFile || bannerFile) {
        // Use multipart FormData when files are attached
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
          if (v !== null && v !== undefined) fd.append(k, String(v));
        });
        if (!editTarget && selectedFeatures.length > 0) {
            selectedFeatures.forEach(f => fd.append('features', f));
        }
        if (logoFile) fd.append('logo', logoFile);
        if (bannerFile) fd.append('banner', bannerFile);
        res = await fetchWithAuth(url, { method, body: fd });
      } else {
        const payload: any = { ...form };
        if (!editTarget && selectedFeatures.length > 0) {
            payload.features = selectedFeatures;
        }
        res = await fetchWithAuth(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

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
              onClick={() => navigate(`/colleges/${col.id}`)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-5 flex flex-col gap-4 cursor-pointer group"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
                    {(col.logo_url || col.logo) ? (
                      <img src={col.logo_url || col.logo} alt={col.code} className="w-8 h-8 object-contain rounded" />
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
                      {col.tier && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                          col.tier === 'PREMIUM' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          col.tier === 'PRO' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                          'bg-blue-50 text-blue-600 border-blue-200'
                        }`}>
                          {col.tier === 'PREMIUM' ? '⭐ Premium' : col.tier === 'PRO' ? '⚡ Pro' : '🛡 Basic'}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 mt-1 text-sm leading-tight truncate" title={col.name}>{col.name}</h3>
                    {col.short_name && <p className="text-xs text-gray-400 truncate">{col.short_name}</p>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    id={`edit-college-${col.id}`}
                    onClick={(e) => { e.stopPropagation(); openEdit(col); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    id={`delete-college-${col.id}`}
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(col.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors ml-1 mt-1.5" />
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
            {step === 1 ? (
            <form onSubmit={handleNext} className="p-6 space-y-5">
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

              {/* Website, Est Year */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
                  <input id="college-form-website" name="website" type="url" value={form.website} onChange={handleChange} placeholder="https://..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Established Year</label>
                  <input id="college-form-year" name="established_year" type="number" value={form.established_year ?? ''} onChange={handleChange} placeholder="e.g. 1998" min={1800} max={new Date().getFullYear()} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>

              {/* Logo & Banner upload */}
              <div className="space-y-4 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Media Assets
                </h3>
                <p className="text-xs text-purple-700">
                  You can also upload / change logo and banner from the <strong>College Details</strong> module after creating the college (Super Admin only).
                </p>

                {/* Logo */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Logo <span className="text-amber-600 font-normal">(must be 180×180 px)</span></label>
                  <div className="flex items-center gap-3">
                    {(logoFile || form.logo) && (
                      <div className="w-10 h-10 border border-gray-200 rounded-lg overflow-hidden bg-white flex-shrink-0">
                        <img
                          src={logoFile ? URL.createObjectURL(logoFile) : form.logo}
                          alt="Logo preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {logoFile ? logoFile.name : 'Upload Logo (180×180 px)'}
                    </button>
                    {logoFile && (
                      <button type="button" onClick={() => setLogoFile(null)} className="text-gray-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    id="college-form-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setLogoFile(f); e.target.value = ''; }}
                  />
                </div>

                {/* Banner */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Banner <span className="text-amber-600 font-normal">(must be 1200×400 px)</span></label>
                  <div className="flex items-center gap-3">
                    {bannerFile && (
                      <div className="w-24 h-8 border border-gray-200 rounded overflow-hidden bg-white flex-shrink-0">
                        <img src={URL.createObjectURL(bannerFile)} alt="Banner preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => bannerInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {bannerFile ? bannerFile.name : 'Upload Banner (1200×400 px)'}
                    </button>
                    {bannerFile && (
                      <button type="button" onClick={() => setBannerFile(null)} className="text-gray-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={bannerInputRef}
                    id="college-form-banner"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setBannerFile(f); e.target.value = ''; }}
                  />
                </div>
              </div>

              {/* Admin Provisioning */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="p-1 bg-blue-50 text-blue-600 rounded">🔐</span> 
                  College Admin Provisioning
                </h3>
                <p className="text-xs text-gray-500 mb-4">Fill these fields to automatically create a Superadmin for this college.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Admin Username</label>
                    <input id="college-form-admin-username" name="admin_username" value={form.admin_username} onChange={handleChange} placeholder="Username" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Admin Email</label>
                    <input id="college-form-admin-email" name="admin_email" type="email" value={form.admin_email} onChange={handleChange} placeholder="admin@college.edu" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Admin Password</label>
                    <input id="college-form-admin-password" name="admin_password" type="password" value={form.admin_password} onChange={handleChange} placeholder="••••••••" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
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
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 shadow-md"
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                  ) : editTarget ? (
                    <><Check className="w-4 h-4" /> Update College</>
                  ) : (
                    <>Next <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </form>
            ) : (
            <div className="p-6 space-y-5 flex flex-col h-full max-h-[80vh]">
              <div className="mb-2 text-center shrink-0">
                  <h3 className="text-xl font-bold text-gray-900">Select Features</h3>
                  <p className="text-sm text-gray-500 mt-1">Choose a preset tier or manually select features.</p>
              </div>
              
              {/* Quick Select Presets */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
                  <button 
                      type="button"
                      onClick={() => setSelectedFeatures(['announcements', 'queries', 'attendance_student', 'marks_student', 'timetable_student', 'curriculum_student'])}
                      className="border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg p-3 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                      <ShieldCheck className="w-4 h-4" /> Basic Preset
                  </button>
                  <button 
                      type="button"
                      onClick={() => setSelectedFeatures(['announcements', 'queries', 'attendance_student', 'marks_student', 'timetable_student', 'curriculum_student', 'attendance_marking', 'attendance_analytics', 'timetable_staff', 'assigned_subjects', 'obe', 'curriculum_dept', 'result_analysis', 'mentor_assign', 'my_calendar', 'staff_salary', 'staff_requests', 'requests_hub', 'feedback', 'events', 'applications_student', 'applications_staff', 'certificates_student', 'certificates_review'])}
                      className="border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg p-3 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                      <Zap className="w-4 h-4" /> Pro Preset
                  </button>
                  <button 
                      type="button"
                      onClick={() => setSelectedFeatures(featuresList.map(f => f.code))}
                      className="border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg p-3 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                      <Star className="w-4 h-4" /> All Features
                  </button>
              </div>

              {/* Individual Checkboxes */}
              <div className="flex-1 overflow-y-auto min-h-[300px] border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                  {featuresList.map(feature => (
                    <label 
                      key={feature.code} 
                      className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-100 cursor-pointer hover:border-blue-200 transition-colors shadow-sm"
                    >
                      <div className="flex items-center h-5 mt-0.5">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          checked={selectedFeatures.includes(feature.code)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFeatures(prev => [...prev, feature.code]);
                            } else {
                              setSelectedFeatures(prev => prev.filter(c => c !== feature.code));
                            }
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 truncate" title={feature.name}>
                              {feature.name}
                            </span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                                {feature.category}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2" title={feature.description}>
                          {feature.description}
                        </p>
                      </div>
                    </label>
                  ))}
                  {featuresList.length === 0 && (
                      <div className="col-span-full py-8 text-center text-sm text-gray-500">
                          Loading features...
                      </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-4 border-t border-gray-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Back
                </button>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-blue-600">
                    {selectedFeatures.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={submitData}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 shadow-md"
                  >
                    {saving ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</>
                    ) : (
                      <><Check className="w-4 h-4" /> Create College</>
                    )}
                  </button>
                </div>
              </div>
            </div>
            )}

          </div>
        </div>
      )}

      {/* Double Password Confirmation Modal */}
      <ConfirmPasswordDeleteModal
        isOpen={deleteConfirm !== null}
        itemName={colleges.find(c => c.id === deleteConfirm)?.name || ''}
        itemType="College"
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) handleDelete(deleteConfirm);
        }}
      />
    </div>
  );
}
