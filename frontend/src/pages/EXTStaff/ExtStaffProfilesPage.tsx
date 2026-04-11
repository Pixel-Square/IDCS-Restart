import React, { useEffect, useRef, useState, useCallback } from 'react';
import { UserPlus, Trash2, Search, Copy, Check, AlertCircle, RefreshCw, GripVertical, Upload, Download, X, FileText, CheckCircle2 } from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImportError {
  row: number;
  errors: string[];
}

interface ImportResult {
  imported: number;
  total: number;
  errors: ImportError[];
}

interface AvailableUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
}

interface ExtStaffProfile {
  id: number;
  external_id: string;
  username: string;
  email: string;
  full_name: string;
  salutation: string;
  designation: string;
  teaching: string;
  faculty_id: string;
  department: string;
  mobile: string;
  gender: string;
  ug_specialization: string;
  pg_specialization: string;
  phd_status: string;
  total_experience: string;
  engg_college_experience: string;
  date_of_birth: string | null;
  account_holder_name: string;
  account_number: string;
  bank_name: string;
  bank_branch_name: string;
  ifsc_code: string;
  passbook_proof: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy UID"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 4px',
        color: copied ? '#16a34a' : '#6b7280',
        transition: 'color 0.2s',
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExtStaffProfilesPage() {
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [profiles, setProfiles] = useState<ExtStaffProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [profileSearch, setProfileSearch] = useState('');
  const [addingUserId, setAddingUserId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExtStaffProfile | null>(null);

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Drag state
  const [dragUserId, setDragUserId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const tableDropRef = useRef<HTMLDivElement>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadAvailableUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetchWithAuth('/api/academics/ext-staff-profiles/available-users/');
      if (!res.ok) throw new Error('Failed to load users');
      setAvailableUsers(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Error loading users');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const res = await fetchWithAuth('/api/academics/ext-staff-profiles/');
      if (!res.ok) throw new Error('Failed to load profiles');
      setProfiles(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Error loading profiles');
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    void loadAvailableUsers();
    void loadProfiles();
  }, [loadAvailableUsers, loadProfiles]);

  // ── Add user to Ext Staff table ────────────────────────────────────────────

  const addUser = useCallback(async (userId: number) => {
    setAddingUserId(userId);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academics/ext-staff-profiles/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          (body as any)?.user_id?.[0] ||
          (body as any)?.detail ||
          'Failed to add user';
        throw new Error(msg);
      }
      await loadAvailableUsers();
      await loadProfiles();
    } catch (e: any) {
      setError(e?.message || 'Error adding user');
    } finally {
      setAddingUserId(null);
    }
  }, [loadAvailableUsers, loadProfiles]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const deleteProfile = useCallback(async (profile: ExtStaffProfile) => {
    setDeletingId(profile.id);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/academics/ext-staff-profiles/${profile.id}/`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      setConfirmDelete(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(profile.id);
        return next;
      });
      await loadAvailableUsers();
      await loadProfiles();
    } catch (e: any) {
      setError(e?.message || 'Error deleting profile');
    } finally {
      setDeletingId(null);
    }
  }, [loadAvailableUsers, loadProfiles]);

  // ── Bulk Delete ────────────────────────────────────────────────────────────

  const bulkDeleteProfiles = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academics/ext-staff-profiles/bulk-delete/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to delete');
      setConfirmBulkDelete(false);
      setSelectedIds(new Set());
      await loadAvailableUsers();
      await loadProfiles();
    } catch (e: any) {
      setError(e?.message || 'Error deleting profiles');
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, loadAvailableUsers, loadProfiles]);

  // ── Drag ───────────────────────────────────────────────────────────────────

  const handleDragStart = (userId: number) => {
    setDragUserId(userId);
  };

  const handleDragEnd = () => {
    setDragUserId(null);
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (dragUserId != null) {
      await addUser(dragUserId);
      setDragUserId(null);
    }
  };

  // ── Import functions ───────────────────────────────────────────────────────

  const handleDownloadTemplate = () => {
    import('xlsx').then((XLSX) => {
      const templateHeaders = [
        'Salutation',
        'Full Name',
        'Email',
        'Password',
        'Teaching',
        'Faculty ID',
        'Designation',
        'College Name',
        'Department (Working In)',
        'Date of Birth',
        'Mobile Number',
        'Gender',
        'UG Specialization',
        'PG Specialization',
        'PhD Status',
        'Total Experience',
        'Engineering College Experience (Years)',
        'Account Holder Name',
        'Account Number',
        'Bank Name',
        'Bank Branch Name',
        'IFSC Code',
        'Notes',
      ];
      const sampleRow = [
        'Dr.',
        'John Doe',
        'john.doe@example.com',
        'password123',
        'Visiting Faculty',
        'VF001',
        'Assistant Professor',
        'ABC Engineering College',
        'Computer Science',
        '1990-01-15',
        '9876543210',
        'Male',
        'B.E / B.Tech - Mechanical Engineering',
        'M.E / M.Tech - Structural Engineering',
        'Completed',
        '10 years',
        '5',
        'John Doe',
        "'1234567890123456",
        'State Bank of India',
        'Chennai Main Branch',
        'SBIN0001234',
        'Internal examiner',
      ];

      const ws = XLSX.utils.aoa_to_sheet([templateHeaders, sampleRow]);

      // Set column widths
      ws['!cols'] = [
        { wch: 10 }, { wch: 22 }, { wch: 28 }, { wch: 14 },
        { wch: 18 }, { wch: 12 }, { wch: 22 }, { wch: 28 },
        { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 35 },
        { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 22 },
        { wch: 22 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 28 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'External Staff Template');
      XLSX.writeFile(wb, 'external_staff_import_template.xlsx');
    });
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportError(null);
    setImportResult(null);

    if (file) {
      const name = file.name.toLowerCase();
      if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
        setImportError('Only .xlsx and .csv files are supported.');
        setImportFile(null);
        return;
      }
    }
    setImportFile(file);
  };

  const handleImportUpload = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await fetchWithAuth('/api/academics/ext-staff-profiles/import/', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setImportError(data.detail || 'Upload failed. Please try again.');
      } else {
        setImportResult(data as ImportResult);
        if ((data as ImportResult).imported > 0) {
          await loadAvailableUsers();
          await loadProfiles();
        }
      }
    } catch {
      setImportError('Network error. Please check your connection and try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleImportModalClose = () => {
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    if (importFileInputRef.current) importFileInputRef.current.value = '';
    setImportModalOpen(false);
  };

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredUsers = availableUsers.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      !q ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.full_name.toLowerCase().includes(q)
    );
  });

  const filteredProfiles = profiles.filter((p) => {
    const q = profileSearch.toLowerCase();
    return (
      !q ||
      p.external_id.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.full_name.toLowerCase().includes(q)
    );
  });

  // ── Selection handlers ─────────────────────────────────────────────────────

  const allSelected = filteredProfiles.length > 0 && selectedIds.size === filteredProfiles.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredProfiles.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProfiles.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#111827' }}>External Staff Profiles</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Select a user from the left panel (click <strong>+</strong> or drag into the table) to create an External Staff Profile with a unique 6-digit External ID.
          </div>
        </div>
        <button
          onClick={() => setImportModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'linear-gradient(180deg, #4f46e5, #4338ca)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(67, 56, 202, 0.25)',
          }}
        >
          <Upload size={15} />
          Import External Staff
        </button>
      </div>

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#b91c1c',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          <AlertCircle size={15} />
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', lineHeight: 1, fontSize: 17 }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── Left: Available Users picker ── */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            background: '#fff',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid #f3f4f6',
              background: '#f9fafb',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: '#111827', flex: 1 }}>
              Available Users
              <span style={{ marginLeft: 6, fontWeight: 600, color: '#6b7280' }}>({filteredUsers.length})</span>
            </div>
            <button
              onClick={() => { void loadAvailableUsers(); void loadProfiles(); }}
              title="Refresh"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 2 }}
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users…"
                style={{
                  width: '100%',
                  paddingLeft: 28,
                  paddingRight: 8,
                  paddingTop: 6,
                  paddingBottom: 6,
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {loadingUsers ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                {userSearch ? 'No matching users' : 'All users are already assigned'}
              </div>
            ) : (
              filteredUsers.map((u) => (
                <div
                  key={u.id}
                  draggable
                  onDragStart={() => handleDragStart(u.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderBottom: '1px solid #f9fafb',
                    cursor: 'grab',
                    background: dragUserId === u.id ? '#eff6ff' : '#fff',
                    transition: 'background 0.1s',
                    userSelect: 'none',
                  }}
                >
                  <GripVertical size={13} color="#d1d5db" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.full_name || u.username}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      @{u.username} · {u.email}
                    </div>
                  </div>
                  <button
                    onClick={() => addUser(u.id)}
                    disabled={addingUserId === u.id}
                    title="Add to Ext Staff"
                    style={{
                      background: addingUserId === u.id ? '#e5e7eb' : '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: 6,
                      padding: '3px 6px',
                      cursor: addingUserId === u.id ? 'not-allowed' : 'pointer',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {addingUserId === u.id ? (
                      <span style={{ fontSize: 11 }}>…</span>
                    ) : (
                      <UserPlus size={13} />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Right: Ext Staff Profiles table ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            ref={tableDropRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: dragOver ? '2px dashed #3b82f6' : '1px solid #e5e7eb',
              borderRadius: 12,
              background: dragOver ? '#eff6ff' : '#fff',
              overflow: 'hidden',
              transition: 'border 0.15s, background 0.15s',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f3f4f6',
                background: '#f9fafb',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13, color: '#111827', flex: 1 }}>
                Ext Staff Profiles
                <span style={{ marginLeft: 6, fontWeight: 600, color: '#6b7280' }}>({filteredProfiles.length})</span>
              </div>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={bulkDeleting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Trash2 size={13} />
                  Delete Selected ({selectedIds.size})
                </button>
              )}
              {dragOver && (
                <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>Drop to add →</span>
              )}
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="text"
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                  placeholder="Search…"
                  style={{
                    paddingLeft: 26,
                    paddingRight: 8,
                    paddingTop: 5,
                    paddingBottom: 5,
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 12,
                    outline: 'none',
                    width: 160,
                  }}
                />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', width: 15, height: 15 }}
                        title="Select All"
                      />
                    </th>
                    {['#', 'Salutation', 'Username', 'Full Name', 'Faculty ID', 'Mobile', 'Gender', 'UG Spec', 'PG Spec', 'PhD', 'Experience', 'Engg Exp', 'DOB', 'Account Holder', 'Account No', 'Bank', 'Branch', 'IFSC', 'Passbook', 'External ID', 'Status', 'Action'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 10px',
                          textAlign: 'left',
                          fontWeight: 800,
                          fontSize: 11,
                          color: '#374151',
                          borderBottom: '1px solid #e5e7eb',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingProfiles ? (
                    <tr>
                      <td colSpan={23} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                        Loading…
                      </td>
                    </tr>
                  ) : filteredProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={23} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                        {dragOver
                          ? 'Drop a user here to add them'
                          : profileSearch
                          ? 'No profiles match your search'
                          : 'No external staff profiles yet. Add users from the left panel.'}
                      </td>
                    </tr>
                  ) : (
                    filteredProfiles.map((p, idx) => (
                      <tr
                        key={p.id}
                        style={{ background: selectedIds.has(p.id) ? '#eff6ff' : idx % 2 === 1 ? '#f9fafb' : '#fff' }}
                      >
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            style={{ cursor: 'pointer', width: 15, height: 15 }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.salutation || '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>@{p.username}</td>
                        <td style={{ padding: '8px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{p.full_name || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.faculty_id || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.mobile || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.gender || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.ug_specialization}>{p.ug_specialization || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.pg_specialization}>{p.pg_specialization || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.phd_status || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.total_experience || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.engg_college_experience || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{p.date_of_birth || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.account_holder_name || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280', fontFamily: 'monospace' }}>{p.account_number || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.bank_name || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.bank_branch_name || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.ifsc_code || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#6b7280' }}>
                          {p.passbook_proof ? (
                            <a
                              href={p.passbook_proof}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#2563eb', textDecoration: 'underline', fontSize: 12 }}
                            >
                              View
                            </a>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <code
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: 5,
                                padding: '2px 6px',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                letterSpacing: 0.5,
                                color: '#1d4ed8',
                                fontWeight: 800,
                              }}
                            >
                              {p.external_id}
                            </code>
                            <CopyButton text={p.external_id} />
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: p.is_active ? '#dcfce7' : '#fee2e2',
                              color: p.is_active ? '#166534' : '#991b1b',
                            }}
                          >
                            {p.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <button
                            onClick={() => setConfirmDelete(p)}
                            disabled={deletingId === p.id}
                            title="Remove profile"
                            style={{
                              background: 'none',
                              border: '1px solid #fecaca',
                              borderRadius: 6,
                              padding: '3px 7px',
                              cursor: deletingId === p.id ? 'not-allowed' : 'pointer',
                              color: '#dc2626',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af' }}>
            Tip: Drag a user from the left panel and drop onto the table to add them.
          </div>
        </div>
      </div>

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              padding: 20,
              width: 'min(420px, 94vw)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 15, color: '#111827', marginBottom: 8 }}>Remove External Staff Profile</div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 16 }}>
              Remove <strong>@{confirmDelete.username}</strong> and their External ID{' '}
              <code style={{ background: '#f3f4f6', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontSize: 12 }}>
                {confirmDelete.external_id}
              </code>
              ? The user account will not be deleted.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="obe-btn"
                onClick={() => setConfirmDelete(null)}
                disabled={deletingId === confirmDelete.id}
              >
                Cancel
              </button>
              <button
                className="obe-btn obe-btn-danger"
                onClick={() => deleteProfile(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
              >
                {deletingId === confirmDelete.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Bulk Delete Modal ── */}
      {confirmBulkDelete && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setConfirmBulkDelete(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              padding: 20,
              width: 'min(420px, 94vw)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 15, color: '#111827', marginBottom: 8 }}>Delete Selected Profiles</div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 16 }}>
              Are you sure you want to delete <strong>{selectedIds.size}</strong> selected external staff profile{selectedIds.size > 1 ? 's' : ''}?
              <br /><br />
              <span style={{ color: '#9ca3af', fontSize: 12 }}>The user accounts will not be deleted.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="obe-btn"
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </button>
              <button
                className="obe-btn obe-btn-danger"
                onClick={bulkDeleteProfiles}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {importModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={handleImportModalClose}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              width: 'min(560px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={18} style={{ color: '#4f46e5' }} />
                <span style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>Import External Staff</span>
              </div>
              <button
                onClick={handleImportModalClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: 4,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 20 }}>
              {/* Info box */}
              <div
                style={{
                  background: '#eef2ff',
                  border: '1px solid #c7d2fe',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', gap: 10 }}>
                  <FileText size={18} style={{ color: '#4f46e5', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#3730a3', marginBottom: 6 }}>
                      Step 1 — Download the template
                    </div>
                    <div style={{ fontSize: 12, color: '#4338ca', marginBottom: 10, lineHeight: 1.5 }}>
                      Fill in the template with external staff details. The template includes columns for:
                      <br />
                      <strong>Username</strong>, <strong>Email</strong>, <strong>First Name</strong> (required) —
                      Password, Teaching, Faculty ID, Designation, College Name, Department, Date of Birth, Mobile, Gender, PhD Status, Experience, Notes.
                    </div>
                    <button
                      onClick={handleDownloadTemplate}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 12px',
                        background: '#4f46e5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <Download size={14} />
                      Download Template
                    </button>
                  </div>
                </div>
              </div>

              {/* File upload */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 8 }}>
                  Step 2 — Upload filled file
                </div>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleImportFileChange}
                  style={{
                    width: '100%',
                    padding: 8,
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  Accepts .xlsx or .csv — max 5 MB
                </div>
              </div>

              {/* Import error */}
              {importError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: 12,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    color: '#b91c1c',
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{importError}</span>
                </div>
              )}

              {/* Import result */}
              {importResult && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 12,
                      background: importResult.imported > 0 ? '#f0fdf4' : '#fffbeb',
                      border: `1px solid ${importResult.imported > 0 ? '#bbf7d0' : '#fde68a'}`,
                      borderRadius: 8,
                      color: importResult.imported > 0 ? '#166534' : '#92400e',
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: importResult.errors.length > 0 ? 12 : 0,
                    }}
                  >
                    <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                    <span>
                      {importResult.imported > 0
                        ? `Successfully imported ${importResult.imported} of ${importResult.total} record${importResult.total !== 1 ? 's' : ''}!`
                        : `No records imported (${importResult.total} row${importResult.total !== 1 ? 's' : ''} processed).`}
                    </span>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div
                      style={{
                        border: '1px solid #fecaca',
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 12px',
                          background: '#fef2f2',
                          borderBottom: '1px solid #fecaca',
                          fontWeight: 700,
                          fontSize: 12,
                          color: '#b91c1c',
                        }}
                      >
                        {importResult.errors.length} row error{importResult.errors.length !== 1 ? 's' : ''}:
                      </div>
                      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                        {importResult.errors.map((err, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '8px 12px',
                              borderBottom: idx < importResult.errors.length - 1 ? '1px solid #fee2e2' : 'none',
                              fontSize: 12,
                            }}
                          >
                            <span style={{ fontWeight: 700, color: '#991b1b' }}>Row {err.row}:</span>{' '}
                            <span style={{ color: '#7f1d1d' }}>{err.errors.join('; ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={handleImportModalClose}
                  disabled={importing}
                  style={{
                    padding: '8px 16px',
                    background: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: importing ? 'not-allowed' : 'pointer',
                    color: '#374151',
                  }}
                >
                  {importResult ? 'Close' : 'Cancel'}
                </button>
                {!importResult && (
                  <button
                    onClick={handleImportUpload}
                    disabled={!importFile || importing}
                    style={{
                      padding: '8px 16px',
                      background: !importFile || importing ? '#9ca3af' : '#4f46e5',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: !importFile || importing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {importing ? 'Importing…' : 'Upload & Import'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
