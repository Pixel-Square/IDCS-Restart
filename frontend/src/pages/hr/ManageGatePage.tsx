import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, Download, RefreshCw } from 'lucide-react'
import { fetchWithAuth } from '../../services/fetchAuth'

type Gate = {
  id: number
  name: string
  description?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type SecurityStaff = {
  id: number
  staff_id: string
  designation?: string
  status?: string
  mobile_number?: string
  rfid_uid?: string

  user_username?: string
  user_first_name?: string
  user_last_name?: string
  user_email?: string
  user_roles?: string[]
}

type ModalProps = {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

function Modal({ title, open, onClose, children }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-xl shadow-lg">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export default function ManageGatePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [gates, setGates] = useState<Gate[]>([])
  const [securityUsers, setSecurityUsers] = useState<SecurityStaff[]>([])

  const [gateModalOpen, setGateModalOpen] = useState(false)
  const [editingGate, setEditingGate] = useState<Gate | null>(null)
  const [gateForm, setGateForm] = useState({ name: '', description: '', is_active: true })

  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<SecurityStaff | null>(null)
  const [userForm, setUserForm] = useState({
    staff_id: '',
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    email: '',
    mobile_number: '',
    designation: '',
    status: 'ACTIVE',
  })

  const [exportGateId, setExportGateId] = useState<string>('')
  const [exportFrom, setExportFrom] = useState<string>('')
  const [exportTo, setExportTo] = useState<string>('')
  const [exporting, setExporting] = useState(false)

  const gateOptions = useMemo(() => [{ id: 0, name: 'All Gates' }, ...gates], [gates])

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [gRes, uRes] = await Promise.all([
        fetchWithAuth('/api/idscan/manage-gates/'),
        fetchWithAuth('/api/idscan/manage-security-users/'),
      ])

      if (!gRes.ok) {
        const t = await gRes.text()
        throw new Error(t || 'Failed to load gates')
      }
      if (!uRes.ok) {
        const t = await uRes.text()
        throw new Error(t || 'Failed to load security users')
      }

      const gatesData = await gRes.json()
      const usersData = await uRes.json()

      setGates(Array.isArray(gatesData) ? gatesData : [])
      setSecurityUsers(Array.isArray(usersData) ? usersData : [])
    } catch (e: any) {
      setError(String(e?.message || e || 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const openCreateGate = () => {
    setEditingGate(null)
    setGateForm({ name: '', description: '', is_active: true })
    setGateModalOpen(true)
  }

  const openEditGate = (g: Gate) => {
    setEditingGate(g)
    setGateForm({ name: g.name || '', description: g.description || '', is_active: !!g.is_active })
    setGateModalOpen(true)
  }

  const saveGate = async () => {
    try {
      const payload = {
        name: gateForm.name.trim(),
        description: gateForm.description,
        is_active: gateForm.is_active,
      }

      let res: Response
      if (editingGate) {
        res = await fetchWithAuth(`/api/idscan/manage-gates/${editingGate.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetchWithAuth('/api/idscan/manage-gates/', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Failed to save gate')
      }

      const saved = (await res.json()) as Gate
      if (editingGate) {
        setGates((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      } else {
        setGates((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)))
      }

      setGateModalOpen(false)
    } catch (e: any) {
      alert(String(e?.message || e || 'Failed to save gate'))
    }
  }

  const deleteGate = async (g: Gate) => {
    if (!window.confirm(`Delete gate "${g.name}"?`)) return
    try {
      const res = await fetchWithAuth(`/api/idscan/manage-gates/${g.id}/`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const t = await res.text()
        throw new Error(t || 'Failed to delete gate')
      }
      setGates((prev) => prev.filter((x) => x.id !== g.id))
    } catch (e: any) {
      alert(String(e?.message || e || 'Failed to delete gate'))
    }
  }

  const openCreateUser = () => {
    setEditingUser(null)
    setUserForm({
      staff_id: '',
      username: '',
      password: '',
      first_name: '',
      last_name: '',
      email: '',
      mobile_number: '',
      designation: '',
      status: 'ACTIVE',
    })
    setUserModalOpen(true)
  }

  const openEditUser = (u: SecurityStaff) => {
    setEditingUser(u)
    setUserForm({
      staff_id: u.staff_id || '',
      username: u.user_username || '',
      password: '',
      first_name: u.user_first_name || '',
      last_name: u.user_last_name || '',
      email: u.user_email || '',
      mobile_number: u.mobile_number || '',
      designation: u.designation || '',
      status: (u.status || 'ACTIVE') as any,
    })
    setUserModalOpen(true)
  }

  const saveUser = async () => {
    try {
      const payload: any = {
        staff_id: userForm.staff_id.trim(),
        username: userForm.username.trim(),
        first_name: userForm.first_name,
        last_name: userForm.last_name,
        email: userForm.email,
        mobile_number: userForm.mobile_number,
        designation: userForm.designation,
        status: userForm.status,
      }
      if (userForm.password) payload.password = userForm.password

      let res: Response
      if (editingUser) {
        res = await fetchWithAuth(`/api/idscan/manage-security-users/${editingUser.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetchWithAuth('/api/idscan/manage-security-users/', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Failed to save user')
      }

      const saved = (await res.json()) as SecurityStaff
      if (editingUser) {
        setSecurityUsers((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      } else {
        setSecurityUsers((prev) => [...prev, saved].sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id))))
      }

      setUserModalOpen(false)
    } catch (e: any) {
      alert(String(e?.message || e || 'Failed to save user'))
    }
  }

  const downloadScansCsv = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (exportGateId && exportGateId !== '0') params.set('gate_id', exportGateId)
      if (exportFrom) params.set('from', exportFrom)
      if (exportTo) params.set('to', exportTo)

      const url = `/api/idscan/rfreader/scans/export.csv${params.toString() ? `?${params.toString()}` : ''}`
      const res = await fetchWithAuth(url, { method: 'GET' })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Failed to export scans')
      }

      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = window.URL.createObjectURL(blob)
      a.download = 'rfreader_scans.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(a.href)
    } catch (e: any) {
      alert(String(e?.message || e || 'Export failed'))
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          <div className="text-gray-600">Loading Manage Gate...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Gate</h1>
          <p className="text-sm text-gray-600">Manage gates, SECURITY users, and export scan logs.</p>
        </div>
        <button
          onClick={loadAll}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border hover:bg-gray-50 text-gray-800"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && <div className="p-4 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>}

      {/* Gates */}
      <section className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Gates</h2>
          <button
            onClick={openCreateGate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4" /> Add Gate
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Active</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 font-medium text-gray-900">{g.name}</td>
                  <td className="py-2 pr-4 text-gray-700">{g.description || '-'}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${g.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                      {g.is_active ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditGate(g)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border hover:bg-gray-50"
                      >
                        <Edit2 className="w-4 h-4" /> Edit
                      </button>
                      <button
                        onClick={() => deleteGate(g)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border hover:bg-red-50 text-red-700"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {gates.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-500">No gates found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Security users */}
      <section className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">SECURITY Users</h2>
          <button
            onClick={openCreateUser}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-4">Staff ID</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Mobile</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {securityUsers.map((u) => {
                const fullName = `${u.user_first_name || ''} ${u.user_last_name || ''}`.trim() || '-'
                return (
                  <tr key={u.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium text-gray-900">{u.staff_id}</td>
                    <td className="py-2 pr-4 text-gray-700">{fullName}</td>
                    <td className="py-2 pr-4 text-gray-700">{u.user_username || '-'}</td>
                    <td className="py-2 pr-4 text-gray-700">{u.mobile_number || '-'}</td>
                    <td className="py-2 pr-4 text-gray-700">{u.status || '-'}</td>
                    <td className="py-2 pr-4">
                      <button
                        onClick={() => openEditUser(u)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border hover:bg-gray-50"
                      >
                        <Edit2 className="w-4 h-4" /> Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
              {securityUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">No SECURITY users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Offline data export */}
      <section className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Offline Data</h2>
            <p className="text-sm text-gray-600">Export RFReader scan logs as CSV.</p>
          </div>
          <button
            onClick={downloadScansCsv}
            disabled={exporting}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white ${exporting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            <Download className="w-4 h-4" /> {exporting ? 'Exporting...' : 'Download CSV'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Gate</label>
            <select
              value={exportGateId}
              onChange={(e) => setExportGateId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {gateOptions.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">From (YYYY-MM-DD)</label>
            <input
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">To (YYYY-MM-DD)</label>
            <input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>
      </section>

      <Modal
        title={editingGate ? 'Edit Gate' : 'Add Gate'}
        open={gateModalOpen}
        onClose={() => setGateModalOpen(false)}
      >
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Name</label>
            <input
              value={gateForm.name}
              onChange={(e) => setGateForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Main Gate"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Description</label>
            <input
              value={gateForm.description}
              onChange={(e) => setGateForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Optional"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={gateForm.is_active}
              onChange={(e) => setGateForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex gap-3 justify-end">
            <button className="px-4 py-2 rounded-lg border" onClick={() => setGateModalOpen(false)}>
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              onClick={saveGate}
              disabled={!gateForm.name.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        title={editingUser ? 'Edit SECURITY User' : 'Add SECURITY User'}
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Staff ID</label>
            <input
              value={userForm.staff_id}
              onChange={(e) => setUserForm((p) => ({ ...p, staff_id: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="SEC001"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Username</label>
            <input
              value={userForm.username}
              onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="security.user"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">First Name</label>
            <input
              value={userForm.first_name}
              onChange={(e) => setUserForm((p) => ({ ...p, first_name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Last Name</label>
            <input
              value={userForm.last_name}
              onChange={(e) => setUserForm((p) => ({ ...p, last_name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Email</label>
            <input
              value={userForm.email}
              onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Mobile</label>
            <input
              value={userForm.mobile_number}
              onChange={(e) => setUserForm((p) => ({ ...p, mobile_number: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Designation</label>
            <input
              value={userForm.designation}
              onChange={(e) => setUserForm((p) => ({ ...p, designation: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Status</label>
            <select
              value={userForm.status}
              onChange={(e) => setUserForm((p) => ({ ...p, status: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 mb-1">
              Password {editingUser ? '(leave empty to keep unchanged)' : ''}
            </label>
            <input
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3 justify-end">
          <button className="px-4 py-2 rounded-lg border" onClick={() => setUserModalOpen(false)}>
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
            onClick={saveUser}
            disabled={!userForm.staff_id.trim() || !userForm.username.trim()}
          >
            Save
          </button>
        </div>
      </Modal>
    </div>
  )
}
