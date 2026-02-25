import React from 'react';
import { User, BookOpen, GraduationCap, Calendar } from 'lucide-react';

interface DashboardEntryPointsProps {
  user?: { username: string; profile_type?: string; profile?: any } | null;
}

export default function DashboardEntryPoints({ user }: DashboardEntryPointsProps) {
  const username = user?.username || 'User';
  
  // Get designation based on profile type
  const getDesignation = () => {
    if (!user) return 'Welcome to the dashboard.';
    
    const profileType = (user.profile_type || '').toUpperCase();
    
    if (profileType === 'STAFF' && user.profile?.designation) {
      return user.profile.designation;
    }
    
    if (profileType === 'STUDENT') {
      return 'Student';
    }
    
    return 'Welcome to the dashboard.';
  };
  
  const designation = getDesignation();
  
  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 sm:p-8 shadow-md">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome, {username}</h1>
            <p className="text-gray-600 mt-1">{designation}</p>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Courses</h3>
          </div>
          <p className="text-sm text-gray-600">View your enrolled courses</p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Academics</h3>
          </div>
          <p className="text-sm text-gray-600">Access academic resources</p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Schedule</h3>
          </div>
          <p className="text-sm text-gray-600">Check your timetable</p>
        </div>
      </div>
    </div>
  );
}
