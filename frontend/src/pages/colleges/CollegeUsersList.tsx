import React, { useEffect, useState, useCallback } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { Search, Trash2, X, Check, Users, GraduationCap, UserCheck } from 'lucide-react';

interface CollegeUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  profile_type: string;
  reg_no: string;
  staff_id: string;
  department: { id: number; code: string; name: string } | null;
  designation: string;
  batch: string;
  status: string;
  phone: string;
  roles: string[];
  created_at: string;
}

interface Props {
  collegeId: number;
}

export default function CollegeUsersList({ collegeId }: Props) {
  const [users, setUsers] = useState<CollegeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/college/colleges/${collegeId}/users/?search=${encodeURIComponent(search)}`;
      if (roleFilter) url += `&role=${encodeURIComponent(roleFilter)}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error('Failed to fetch users');
      setUsers(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [collegeId, search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/accounts/roles/');
        if (res.ok) {
          const data = await res.json();
          setRoles(data.roles || []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const handleRemove = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`/api/college/colleges/${collegeId}/users/${userId}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Remove failed');
      setDeleteConfirm(null);
      fetchUsers();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const studentCount = users.filter(u => u.profile_type === 'STUDENT').length;
  const staffCount = users.filter(u => u.profile_type !== 'STUDENT').length;

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-blue-200 rounded-lg"><Users className="w-5 h-5 text-blue-700" /></div>
          <div>
            <p className="text-2xl font-bold text-blue-800">{users.length}</p>
            <p className="text-xs text-blue-600">Total Users</p>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-purple-200 rounded-lg"><GraduationCap className="w-5 h-5 text-purple-700" /></div>
          <div>
            <p className="text-2xl font-bold text-purple-800">{studentCount}</p>
            <p className="text-xs text-purple-600">Students</p>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-200 rounded-lg"><UserCheck className="w-5 h-5 text-emerald-700" /></div>
          <div>
            <p className="text-2xl font-bold text-emerald-800">{staffCount}</p>
            <p className="text-xs text-emerald-600">Staff / Faculty</p>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
          <input
            id="college-users-search"
            type="text"
            placeholder="Search by name, email, reg no, or staff ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <select
          id="college-users-role-filter"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-w-[150px]"
        >
          <option value="">All Roles</option>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-center">{error}</div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
          <Users className="w-14 h-14 opacity-30" />
          <p className="text-lg font-medium">No users found</p>
          <p className="text-sm">Import users using the "Users Import" tab.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Roles</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Department</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={`${u.profile_type}-${u.id}`} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.username}</div>
                      {u.phone && <div className="text-xs text-gray-400">{u.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        {u.profile_type === 'STUDENT' ? u.reg_no : u.staff_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                        u.profile_type === 'STUDENT' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.profile_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map(r => (
                          <span key={r} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {u.department ? u.department.code : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                        u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                        u.status === 'INACTIVE' ? 'bg-gray-100 text-gray-500' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {deleteConfirm === u.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleRemove(u.id)} className="p-1 bg-red-600 text-white rounded-md hover:bg-red-700" title="Confirm">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteConfirm(null)} className="p-1 bg-gray-200 text-gray-600 rounded-md hover:bg-gray-300" title="Cancel">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(u.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove from college"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
