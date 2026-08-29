import re

with open('frontend/src/pages/colleges/CollegesPage.tsx', 'r') as f:
    content = f.read()

# Add new imports
content = content.replace(
    "import { Building2, Plus, Search, Edit2, Trash2, X, Check, Globe, Phone, Mail, MapPin, Calendar, ChevronRight, Image as ImageIcon, Upload } from 'lucide-react';",
    "import { Building2, Plus, Search, Edit2, Trash2, X, Check, Globe, Phone, Mail, MapPin, Calendar, ChevronRight, Image as ImageIcon, Upload, ArrowRight, ShieldCheck, Zap, Star } from 'lucide-react';"
)

# Add feature interface
content = content.replace(
    "interface College {",
    "interface FeatureItem {\n  code: string;\n  name: string;\n  description: string;\n  category: string;\n}\n\ninterface College {"
)

# Add step state and features state
state_repl = """  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [featuresList, setFeaturesList] = useState<FeatureItem[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
"""
content = content.replace("  const [formError, setFormError] = useState<string | null>(null);", state_repl)


# Fetch features
fetch_features = """  const fetchFeaturesList = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/accounts/features/');
      if (res.ok) setFeaturesList(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchColleges(); fetchFeaturesList(); }, [fetchColleges, fetchFeaturesList]);"""

content = content.replace(
    "useEffect(() => { fetchColleges(); }, [fetchColleges]);",
    fetch_features
)


# Reset step on openCreate
open_create_repl = """  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setLogoFile(null);
    setBannerFile(null);
    setFormError(null);
    setStep(1);
    setSelectedFeatures([]);
    setShowModal(true);
  };"""
content = content.replace(
    "  const openCreate = () => {\n    setEditTarget(null);\n    setForm(emptyForm);\n    setLogoFile(null);\n    setBannerFile(null);\n    setFormError(null);\n    setShowModal(true);\n  };",
    open_create_repl
)

# Replace handleSubmit with handleCreate/handleNext
handle_submit_repl = """  const handleNext = (e: React.FormEvent) => {
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
  };"""

content = re.sub(
    r"  const handleSubmit = async.*?  \};\n",
    handle_submit_repl,
    content,
    flags=re.DOTALL
)

# Modal changes for Step 1 and 2
modal_content = """            {/* Modal Form */}
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
            <div className="p-6 space-y-5">
              <div className="mb-4 text-center">
                  <h3 className="text-xl font-bold text-gray-900">Select Feature Tier</h3>
                  <p className="text-sm text-gray-500 mt-2">Choose the suite of features that fits this college's needs.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                  {/* Basic Tier */}
                  <div 
                      onClick={() => setSelectedFeatures(['announcements', 'queries', 'attendance_student', 'marks_student', 'timetable_student', 'curriculum_student'])}
                      className={`cursor-pointer border-2 rounded-2xl p-5 flex flex-col items-center text-center transition-all ${
                          selectedFeatures.length > 0 && selectedFeatures.length <= 10 ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                      }`}
                  >
                      <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3">
                          <ShieldCheck className="w-6 h-6 text-blue-500" />
                      </div>
                      <h4 className="font-bold text-gray-900 mb-2">Basic Tier</h4>
                      <p className="text-xs text-gray-500 leading-relaxed">
                          Essential features including announcements, student timetable, attendance, and support queries.
                      </p>
                  </div>
                  
                  {/* Pro Tier */}
                  <div 
                      onClick={() => setSelectedFeatures(['announcements', 'queries', 'attendance_student', 'marks_student', 'timetable_student', 'curriculum_student', 'attendance_marking', 'attendance_analytics', 'timetable_staff', 'assigned_subjects', 'obe', 'curriculum_dept', 'result_analysis', 'mentor_assign', 'my_calendar', 'staff_salary', 'staff_requests', 'requests_hub', 'feedback', 'events', 'applications_student', 'applications_staff', 'certificates_student', 'certificates_review'])}
                      className={`cursor-pointer border-2 rounded-2xl p-5 flex flex-col items-center text-center transition-all ${
                          selectedFeatures.length > 10 && selectedFeatures.length < featuresList.length ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300'
                      }`}
                  >
                      <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3">
                          <Zap className="w-6 h-6 text-purple-500" />
                      </div>
                      <h4 className="font-bold text-gray-900 mb-2">Pro Tier</h4>
                      <p className="text-xs text-gray-500 leading-relaxed">
                          Includes Basic tier plus staff attendance marking, OBE, HR management, and quality feedback.
                      </p>
                  </div>
                  
                  {/* Premium Tier */}
                  <div 
                      onClick={() => setSelectedFeatures(featuresList.map(f => f.code))}
                      className={`cursor-pointer border-2 rounded-2xl p-5 flex flex-col items-center text-center transition-all ${
                          selectedFeatures.length === featuresList.length && featuresList.length > 0 ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
                      }`}
                  >
                      <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3">
                          <Star className="w-6 h-6 text-amber-500" />
                      </div>
                      <h4 className="font-bold text-gray-900 mb-2">Premium Tier</h4>
                      <p className="text-xs text-gray-500 leading-relaxed">
                          Full suite including basic, pro, advanced administration, security scanning, and IQAC features.
                      </p>
                  </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={submitData}
                  disabled={saving || selectedFeatures.length === 0}
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
            )}
"""

content = re.sub(
    r"            \{/\* Modal Form \*/\}.*?            </form>",
    modal_content,
    content,
    flags=re.DOTALL
)

with open('frontend/src/pages/colleges/CollegesPage.tsx', 'w') as f:
    f.write(content)

print("Done")
