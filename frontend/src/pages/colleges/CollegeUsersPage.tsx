import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import CollegeUsersList from './CollegeUsersList';
import CollegeUsersImport from './CollegeUsersImport';
import { Building2, ArrowLeft, Users, Upload, ChevronRight } from 'lucide-react';

interface College {
  id: number;
  code: string;
  name: string;
  short_name: string;
  city: string;
  state: string;
  is_active: boolean;
}

export default function CollegeUsersPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [college, setCollege] = useState<College | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'import'>('list');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(`/api/college/colleges/${id}/`);
        if (!res.ok) throw new Error('Not found');
        setCollege(await res.json());
      } catch {
        setCollege(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!college) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="text-lg font-medium">College not found</p>
        <button onClick={() => navigate('/colleges')} className="mt-4 text-blue-600 hover:underline">← Back to Colleges</button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <button onClick={() => navigate('/colleges')} className="hover:text-blue-600 transition-colors">Colleges</button>
        <ChevronRight className="w-3.5 h-3.5" />
        <button onClick={() => navigate(`/colleges/${college.id}`)} className="hover:text-blue-600 transition-colors">{college.code}</button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-700 font-medium">Users</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(`/colleges/${college.id}`)}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-3 bg-blue-100 rounded-xl">
          <Users className="w-7 h-7 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">{college.name}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        <button
          id="tab-users-list"
          onClick={() => setTab('list')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'list'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          Users List
        </button>
        <button
          id="tab-users-import"
          onClick={() => setTab('import')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'import'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Upload className="w-4 h-4" />
          Users Import
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'list' ? (
        <CollegeUsersList collegeId={college.id} />
      ) : (
        <CollegeUsersImport collegeId={college.id} collegeName={college.name} onImportComplete={() => setTab('list')} />
      )}
    </div>
  );
}
