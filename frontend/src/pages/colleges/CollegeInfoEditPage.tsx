/**
 * CollegeInfoEditPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Super-Admin only — College Details module accessible from the College detail
 * hub page.  Every save requires the super admin to re-enter their password
 * (double authentication) before any changes are persisted.
 *
 * Image requirements (enforced server-side, hinted client-side):
 *   Logo   : 180 × 180 px  (square)
 *   Banner : 1200 × 400 px (3:1 landscape)
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Image as ImageIcon,
  Lock,
  Save,
  Shield,
  Upload,
  X,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CollegeData {
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
  is_active: boolean;
  logo_url: string | null;
  banner_url: string | null;
  logo_resolution?: string;
  banner_resolution?: string;
}

// ─── Double-auth modal ───────────────────────────────────────────────────────

function PasswordModal({
  saving,
  error,
  onConfirm,
  onClose,
}: {
  saving: boolean;
  error: string | null;
  onConfirm: (pwd: string) => void;
  onClose: () => void;
}) {
  const [pwd, setPwd] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the password input when the modal opens
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.trim()) onConfirm(pwd.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-red-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5 flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base">Super Admin Verification</h3>
            <p className="text-red-100 text-xs mt-0.5">Enter your password to save changes</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Super Admin Password <span className="text-red-500">*</span>
            </label>
            <input
              ref={inputRef}
              id="sa-password-input"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Enter your password"
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              id="sa-password-confirm-btn"
              type="submit"
              disabled={saving || !pwd.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4" /> Confirm & Save</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Image upload field ──────────────────────────────────────────────────────

function ImageUploadField({
  id,
  label,
  hint,
  currentUrl,
  resolution,
  file,
  preview,
  onChange,
  onClear,
}: {
  id: string;
  label: string;
  hint: string;
  currentUrl: string | null;
  resolution: string;
  file: File | null;
  preview: string | null;
  onChange: (f: File) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const displaySrc = preview || currentUrl;

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-1.5">
        <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
        Fixed resolution required: <strong>{resolution}</strong>. The backend will reject images
        with a different size.
      </p>

      <div className="flex items-start gap-4">
        {/* Preview box */}
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center flex-shrink-0"
          style={
            label.toLowerCase().includes('banner')
              ? { width: 240, height: 80 }
              : { width: 80, height: 80 }
          }
        >
          {displaySrc ? (
            <img
              src={displaySrc}
              alt={label}
              className="w-full h-full object-contain"
            />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-300" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            id={`${id}-upload-btn`}
            onClick={() => ref.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors"
          >
            <Upload className="w-4 h-4" />
            {file ? 'Change Image' : 'Upload Image'}
          </button>
          {(file || currentUrl) && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {file ? 'Remove new upload' : 'Clear current'}
            </button>
          )}
          {file && (
            <p className="text-xs text-green-700 font-medium">✓ {file.name} selected</p>
          )}
        </div>
      </div>

      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
          e.target.value = '';
        }}
      />
      <p className="text-xs text-gray-400 mt-2">{hint}</p>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CollegeInfoEditPage({ user }: { user?: any }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [college, setCollege] = useState<CollegeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form state (mirrors CollegeData text fields)
  const [form, setForm] = useState({
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
    established_year: '' as string | number,
    is_active: true,
  });

  // Image upload state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  // Double-auth modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Check super admin access ──────────────────────────────────────────────
  const isSuperAdmin = user && (
    (user.roles || []).map((r: string) => r.toUpperCase()).includes('SUPER_ADMIN') ||
    user.is_superuser
  );

  // ── Fetch college data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetchWithAuth(`/api/college/colleges/${id}/details/`);
        if (!res.ok) {
          if (res.status === 403) throw new Error('Access denied — Super Admin only.');
          throw new Error('Failed to load college details.');
        }
        const data: CollegeData = await res.json();
        setCollege(data);
        setForm({
          code: data.code || '',
          name: data.name || '',
          short_name: data.short_name || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          country: data.country || '',
          postal_code: data.postal_code || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          established_year: data.established_year ?? '',
          is_active: data.is_active,
        });
      } catch (e: any) {
        setFetchError(e.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Image preview helpers ─────────────────────────────────────────────────
  const handleLogoChange = (f: File) => {
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };
  const handleBannerChange = (f: File) => {
    setBannerFile(f);
    setBannerPreview(URL.createObjectURL(f));
  };

  // ── Form change handler ───────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm(f => ({ ...f, [name]: (e.target as HTMLInputElement).checked }));
    } else if (name === 'established_year') {
      setForm(f => ({ ...f, established_year: value }));
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  // ── Save — opens password modal ───────────────────────────────────────────
  const openSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setShowPasswordModal(true);
  };

  // ── Actual save with password ─────────────────────────────────────────────
  const handleSaveWithPassword = async (pwd: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      const formData = new FormData();
      // Append text fields
      Object.entries(form).forEach(([key, val]) => {
        if (val !== null && val !== undefined) {
          formData.append(key, String(val));
        }
      });
      // Append password for double-auth
      formData.append('sa_password', pwd);
      // Append image files if selected
      if (logoFile) formData.append('logo', logoFile);
      if (bannerFile) formData.append('banner', bannerFile);

      const res = await fetchWithAuth(`/api/college/colleges/${id}/details/`, {
        method: 'PATCH',
        body: formData,
        // Don't set Content-Type — browser sets it with boundary for FormData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail ||
          Object.entries(err)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' | ') ||
          'Save failed';
        setSaveError(msg);
        return;
      }

      const updated: CollegeData = await res.json();
      setCollege(updated);
      setForm({
        code: updated.code || '',
        name: updated.name || '',
        short_name: updated.short_name || '',
        address: updated.address || '',
        city: updated.city || '',
        state: updated.state || '',
        country: updated.country || '',
        postal_code: updated.postal_code || '',
        phone: updated.phone || '',
        email: updated.email || '',
        website: updated.website || '',
        established_year: updated.established_year ?? '',
        is_active: updated.is_active,
      });
      // Clear file selections after successful save
      setLogoFile(null);
      setLogoPreview(null);
      setBannerFile(null);
      setBannerPreview(null);
      setSaveSuccess(true);
      setShowPasswordModal(false);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (e: any) {
      setSaveError(e.message || 'Network error');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center">
        <div className="max-w-sm mx-auto">
          <div className="p-4 bg-red-50 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Lock className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-gray-500 text-sm">
            The College Details module is accessible to Super Admins only.
          </p>
          <button
            onClick={() => navigate(`/colleges/${id}`)}
            className="mt-6 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            ← Back to College
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (fetchError || !college) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="text-base font-medium text-red-600">{fetchError || 'College not found.'}</p>
        <button
          onClick={() => navigate(`/colleges/${id}`)}
          className="mt-4 text-blue-600 hover:underline text-sm"
        >
          ← Back
        </button>
      </div>
    );
  }

  const inputCls =
    'w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 flex-wrap">
        <button onClick={() => navigate('/colleges')} className="hover:text-blue-600 transition-colors">
          Colleges
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <button onClick={() => navigate(`/colleges/${id}`)} className="hover:text-blue-600 transition-colors">
          {college.code}
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-700 font-medium">College Details</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(`/colleges/${id}`)}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-3 bg-red-100 rounded-xl">
          <Shield className="w-7 h-7 text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">College Details</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Super Admin only — all saves require password re-verification
          </p>
        </div>
      </div>

      {/* Security notice banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 mb-6">
        <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>Double Authentication Required.</strong> Every time you click &ldquo;Save Changes&rdquo;,
          you will be asked to re-enter your Super Admin password before the data is persisted.
        </p>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-5 py-3.5 mb-6 flex items-center gap-2 text-sm font-medium">
          ✓ College details saved successfully.
        </div>
      )}

      {/* Form */}
      <form onSubmit={openSave} className="space-y-8">
        {/* ── Basic Information ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            Basic Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Code <span className="text-red-500">*</span></label>
              <input id="details-code" name="code" value={form.code} onChange={handleChange} required className={inputCls} placeholder="e.g. KRCT" />
            </div>
            <div>
              <label className={labelCls}>Name <span className="text-red-500">*</span></label>
              <input id="details-name" name="name" value={form.name} onChange={handleChange} required className={inputCls} placeholder="Full college name" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Short Name</label>
              <input id="details-short-name" name="short_name" value={form.short_name} onChange={handleChange} className={inputCls} placeholder="Optional short display name" />
            </div>
          </div>
        </section>

        {/* ── Address ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-900 mb-5">Address</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Street Address</label>
              <textarea id="details-address" name="address" value={form.address} onChange={handleChange} rows={3} className={`${inputCls} resize-none`} placeholder="Street address..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>City</label>
                <input id="details-city" name="city" value={form.city} onChange={handleChange} className={inputCls} placeholder="City" />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <input id="details-state" name="state" value={form.state} onChange={handleChange} className={inputCls} placeholder="State" />
              </div>
              <div>
                <label className={labelCls}>Country</label>
                <input id="details-country" name="country" value={form.country} onChange={handleChange} className={inputCls} placeholder="Country" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Postal Code</label>
              <input id="details-postal" name="postal_code" value={form.postal_code} onChange={handleChange} className={`${inputCls} max-w-xs`} placeholder="PIN / ZIP" />
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-900 mb-5">Contact & Web</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <input id="details-phone" name="phone" value={form.phone} onChange={handleChange} className={inputCls} placeholder="Phone number" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input id="details-email" name="email" type="email" value={form.email} onChange={handleChange} className={inputCls} placeholder="contact@college.edu" />
            </div>
            <div>
              <label className={labelCls}>Website</label>
              <input id="details-website" name="website" value={form.website} onChange={handleChange} className={inputCls} placeholder="https://..." />
            </div>
            <div>
              <label className={labelCls}>Established Year</label>
              <input
                id="details-year"
                name="established_year"
                type="number"
                value={form.established_year}
                onChange={handleChange}
                min={1800}
                max={new Date().getFullYear()}
                className={`${inputCls} max-w-xs`}
                placeholder="e.g. 1994"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 p-3 bg-gray-50 rounded-xl w-fit">
            <input
              id="details-active"
              name="is_active"
              type="checkbox"
              checked={form.is_active}
              onChange={handleChange}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <label htmlFor="details-active" className="text-sm font-medium text-gray-700 cursor-pointer">
              College is Active
            </label>
          </div>
        </section>

        {/* ── Media Assets ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-8">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-purple-600" />
            Media Assets
          </h2>

          <ImageUploadField
            id="details-logo"
            label="College Logo"
            hint="Used in mark sheets, report covers, certificates, and all template headers."
            currentUrl={college.logo_url}
            resolution={college.logo_resolution || '180×180 px'}
            file={logoFile}
            preview={logoPreview}
            onChange={handleLogoChange}
            onClear={() => { setLogoFile(null); setLogoPreview(null); }}
          />

          <hr className="border-gray-100" />

          <ImageUploadField
            id="details-banner"
            label="College Banner"
            hint="Used in report page headers, letterheads, and wide-format templates."
            currentUrl={college.banner_url}
            resolution={college.banner_resolution || '1200×400 px'}
            file={bannerFile}
            preview={bannerPreview}
            onChange={handleBannerChange}
            onClear={() => { setBannerFile(null); setBannerPreview(null); }}
          />
        </section>

        {/* ── Submit ── */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/colleges/${id}`)}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            id="save-college-details-btn"
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md"
          >
            <Lock className="w-4 h-4" />
            Save Changes (with verification)
          </button>
        </div>
      </form>

      {/* Double-auth password modal */}
      {showPasswordModal && (
        <PasswordModal
          saving={saving}
          error={saveError}
          onConfirm={handleSaveWithPassword}
          onClose={() => { setShowPasswordModal(false); setSaveError(null); }}
        />
      )}
    </div>
  );
}
