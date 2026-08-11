import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Edit, Trash2, Building2 } from 'lucide-react';
import { useSearchParams, Link, useNavigate, useParams } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';

interface Course {
  id: number;
  name: string;
  department: number;
  department_name: string;
  program: number;
  program_name: string;
  college: number;
}

interface Department {
  id: number;
  name: string;
}

interface Program {
  id: number;
  name: string;
}

export default function CourseList() {
  const { id: collegeId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState({ name: '', department: '', program: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [collegeId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const q = collegeId ? `?college_id=${collegeId}` : '';
      const [crsRes, deptRes, progRes] = await Promise.all([
        fetchWithAuth(`/api/college/course-records/${q}`),
        fetchWithAuth(`/api/college/departments/${q}`),
        fetchWithAuth(`/api/college/programs/${q}`),
      ]);
      
      if (!crsRes.ok) throw new Error('Failed to fetch courses');
      setCourses(await crsRes.json());
      
      if (deptRes.ok) {
        const d = await deptRes.json();
        setDepartments(Array.isArray(d) ? d : []);
      }
      if (progRes.ok) {
        const p = await progRes.json();
        setPrograms(Array.isArray(p) ? p : []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (c?: Course) => {
    setFormError(null);
    if (c) {
      setEditingCourse(c);
      setFormData({ name: c.name, department: String(c.department), program: String(c.program) });
    } else {
      setEditingCourse(null);
      setFormData({ name: '', department: '', program: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const method = editingCourse ? 'PUT' : 'POST';
      const url = editingCourse 
        ? `/api/college/course-records/${editingCourse.id}/` 
        : `/api/college/course-records/`;
      
      const payload = {
        name: formData.name,
        department: Number(formData.department),
        program: Number(formData.program),
        college: collegeId ? Number(collegeId) : null
      };

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save course');
      }
      setShowModal(false);
      fetchData(); // Refresh list
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this course?')) return;
    try {
      const res = await fetchWithAuth(`/api/college/course-records/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete course');
      setCourses(prev => prev.filter(c => c.id !== id));
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
            <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
            <p className="text-sm text-gray-500">Manage course configurations mapped to programs and departments</p>
          </div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Add Course
        </button>
      </div>

      {collegeId && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-6 flex items-center gap-2 text-indigo-800">
          <Building2 className="w-5 h-5 text-indigo-600" />
          <span className="text-sm font-medium">Viewing courses scoped to College ID: {collegeId}</span>
        </div>
      )}

      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg font-medium">Error: {error}</div>
      ) : loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center p-12 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-gray-500 font-medium">No courses found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-sm font-semibold text-gray-700">Name</th>
                <th className="px-6 py-3 text-sm font-semibold text-gray-700">Program</th>
                <th className="px-6 py-3 text-sm font-semibold text-gray-700">Department</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courses.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 text-gray-600">{c.program_name || '-'}</td>
                  <td className="px-6 py-4 text-gray-600">{c.department_name || '-'}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <button onClick={() => handleOpenModal(c)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-2">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
              <h2 className="text-xl font-bold text-gray-900">{editingCourse ? 'Edit Course' : 'Add Course'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              {formError && (
                <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm">{formError}</div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Course Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. B.Tech Computer Science"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Program *</label>
                  <select
                    required
                    value={formData.program}
                    onChange={e => setFormData({ ...formData, program: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                  >
                    <option value="">Select a Program</option>
                    {programs.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Department *</label>
                  <select
                    required
                    value={formData.department}
                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                  >
                    <option value="">Select a Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
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
                  {submitting ? 'Saving...' : 'Save Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
