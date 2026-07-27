import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { Building2, ArrowLeft, Users, Settings2, ChevronRight, MapPin, Phone, Mail, Globe, Calendar, Landmark } from 'lucide-react';

interface College {
  id: number;
  code: string;
  name: string;
  short_name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  established_year: number | null;
  is_active: boolean;
}

interface FeatureSummary {
  total: number;
  enabled: number;
}

export default function CollegeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [college, setCollege] = useState<College | null>(null);
  const [loading, setLoading] = useState(true);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [featureSummary, setFeatureSummary] = useState<FeatureSummary | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(`/api/college/colleges/${id}/`);
        if (!res.ok) throw new Error('Not found');
        setCollege(await res.json());

        // Fetch user count
        const usersRes = await fetchWithAuth(`/api/college/colleges/${id}/users/`);
        if (usersRes.ok) {
          const users = await usersRes.json();
          setUserCount(Array.isArray(users) ? users.length : 0);
        }

        // Fetch feature summary
        const featRes = await fetchWithAuth(`/api/college/colleges/${id}/features/`);
        if (featRes.ok) {
          const feats = await featRes.json();
          setFeatureSummary({
            total: feats.length,
            enabled: feats.filter((f: any) => f.is_enabled).length,
          });
        }
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

  const sections = [
    {
      key: 'users',
      title: 'Users',
      description: 'Manage students, faculty, and staff associated with this college. Import users in bulk via Excel.',
      icon: Users,
      color: 'blue',
      stat: userCount !== null ? `${userCount} user${userCount !== 1 ? 's' : ''}` : 'Loading...',
      to: `/colleges/${college.id}/users`,
    },
    {
      key: 'features',
      title: 'Features Management',
      description: 'Enable or disable modules for this college. Each toggle is isolated — changes here don\'t affect other colleges.',
      icon: Settings2,
      color: 'indigo',
      stat: featureSummary ? `${featureSummary.enabled} of ${featureSummary.total} active` : 'Loading...',
      to: `/colleges/${college.id}/features`,
    },
    {
      key: 'departments',
      title: 'Departments',
      description: 'View and manage all departments. Add, edit, or remove teaching and non-teaching departments.',
      icon: Landmark,
      color: 'teal',
      stat: 'Manage departments',
      to: `/departments`,
    },
  ];

  const colorMap: Record<string, { bg: string; iconBg: string; iconText: string; hoverBorder: string; statBg: string; statText: string }> = {
    blue:   { bg: 'bg-white', iconBg: 'bg-blue-100',   iconText: 'text-blue-600',   hoverBorder: 'hover:border-blue-300',   statBg: 'bg-blue-50',   statText: 'text-blue-700' },
    indigo: { bg: 'bg-white', iconBg: 'bg-indigo-100', iconText: 'text-indigo-600', hoverBorder: 'hover:border-indigo-300', statBg: 'bg-indigo-50', statText: 'text-indigo-700' },
    teal:   { bg: 'bg-white', iconBg: 'bg-teal-100',   iconText: 'text-teal-600',   hoverBorder: 'hover:border-teal-300',   statBg: 'bg-teal-50',   statText: 'text-teal-700' },
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <button onClick={() => navigate('/colleges')} className="hover:text-blue-600 transition-colors">Colleges</button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-700 font-medium">{college.code}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/colleges')}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-3 bg-blue-100 rounded-xl">
          <Building2 className="w-7 h-7 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{college.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">{college.code}</span>
            {college.city && <span className="text-xs text-gray-400">{[college.city, college.state].filter(Boolean).join(', ')}</span>}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${college.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {college.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* College Info Card */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
          {(college.city || college.state || college.country) && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="truncate">{[college.city, college.state, college.country].filter(Boolean).join(', ')}</span>
            </div>
          )}
          {college.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span>{college.phone}</span>
            </div>
          )}
          {college.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <a href={`mailto:${college.email}`} className="text-blue-500 hover:underline truncate">{college.email}</a>
            </div>
          )}
          {college.website && (
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <a href={college.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline truncate">{college.website}</a>
            </div>
          )}
          {college.established_year && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span>Established {college.established_year}</span>
            </div>
          )}
        </div>
      </div>

      {/* Section Cards */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">Manage</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sections.map(section => {
          const c = colorMap[section.color] || colorMap.blue;
          const Icon = section.icon;
          return (
            <button
              key={section.key}
              onClick={() => navigate(section.to)}
              className={`${c.bg} border border-gray-100 ${c.hoverBorder} rounded-2xl shadow-sm hover:shadow-lg transition-all p-6 text-left group cursor-pointer`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`p-3 ${c.iconBg} rounded-xl`}>
                    <Icon className={`w-7 h-7 ${c.iconText}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{section.title}</h3>
                    <p className="text-sm text-gray-500 mt-1 leading-relaxed">{section.description}</p>
                    <span className={`inline-block mt-3 text-xs font-semibold px-2.5 py-1 rounded-lg ${c.statBg} ${c.statText}`}>
                      {section.stat}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-2" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
