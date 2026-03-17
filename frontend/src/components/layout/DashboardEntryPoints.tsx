import React, { useState, useEffect } from 'react';
import { User, BookOpen, GraduationCap, Calendar, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';

interface DashboardEntryPointsProps {
  user?: { username: string; profile_type?: string; profile?: any } | null;
}

interface AttendanceStatus {
  date: string;
  status: 'present' | 'absent' | 'partial' | 'half_day' | 'no_record';
  fn_status: string;
  an_status: string;
  morning_in: string | null;
  evening_out: string | null;
  has_record: boolean;
}

export default function DashboardEntryPoints({ user }: DashboardEntryPointsProps) {
  const username = user?.username || 'User';
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [avatarCandidateIndex, setAvatarCandidateIndex] = useState(0);

  const avatarUrlCandidates = React.useMemo(() => {
    const rootValue = String((user as any)?.profile_image || '').trim();
    const nestedValue = String((user as any)?.profile?.profile_image || '').trim();
    const raw = rootValue || nestedValue;
    if (!raw) return [] as string[];

    const normalized = raw.replace(/\\+/g, '/');
    if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('blob:') || normalized.startsWith('data:')) {
      return [normalized];
    }

    if (normalized.startsWith('/')) {
      const direct = normalized;
      const apiBaseUrl = `${getApiBase()}${normalized}`;
      return direct === apiBaseUrl ? [direct] : [direct, apiBaseUrl];
    }

    const direct = `/media/${normalized}`;
    const apiBaseUrl = `${getApiBase()}/media/${normalized}`;
    return direct === apiBaseUrl ? [direct] : [direct, apiBaseUrl];
  }, [user]);

  useEffect(() => {
    setAvatarCandidateIndex(0);
  }, [avatarUrlCandidates]);

  const currentAvatarUrl = avatarUrlCandidates[avatarCandidateIndex] || '';
  
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
  const isStaff = user?.profile_type?.toUpperCase() === 'STAFF';

  // Fetch today's attendance status for staff
  useEffect(() => {
    if (isStaff) {
      fetchTodayAttendance();
    }
  }, [isStaff]);

  const fetchTodayAttendance = async () => {
    try {
      setLoadingAttendance(true);
      const url = `${getApiBase()}/api/staff-attendance/records/today_status/`;
      const response = await apiClient.get(url);
      setAttendanceStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch attendance status:', error);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const getAttendanceIcon = (status: string) => {
    switch (status) {
      case 'present':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'partial':
      case 'half_day':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'no_record':
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
      case 'absent':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getAttendanceColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-50 border-green-200';
      case 'partial':
      case 'half_day':
        return 'bg-yellow-50 border-yellow-200';
      case 'no_record':
        return 'bg-gray-50 border-gray-200';
      case 'absent':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'present':
        return 'Present';
      case 'partial':
        return 'Partial';
      case 'half_day':
        return 'Half Day';
      case 'no_record':
        return 'No Record';
      case 'absent':
        return 'Absent';
      default:
        return 'Unknown';
    }
  };

  const getSessionStatusText = (status?: string) => {
    if (!status || status === 'no_record') return 'No Record';
    return status.toUpperCase();
  };
  
  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 sm:p-8 shadow-md">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
            {currentAvatarUrl ? (
              <img
                src={currentAvatarUrl}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={() => setAvatarCandidateIndex((prev) => prev + 1)}
              />
            ) : (
              <User className="w-7 h-7 text-white" />
            )}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome, {username}</h1>
            <p className="text-gray-600 mt-1">{designation}</p>
          </div>
        </div>
      </div>

      {/* Attendance Status for Staff */}
      {isStaff && (
        <div className={`rounded-xl p-6 shadow-md border ${
          attendanceStatus ? getAttendanceColor(attendanceStatus.status) : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
              {loadingAttendance ? (
                <Clock className="w-6 h-6 text-gray-400 animate-spin" />
              ) : attendanceStatus ? (
                getAttendanceIcon(attendanceStatus.status)
              ) : (
                <AlertCircle className="w-6 h-6 text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Today's Attendance</h3>
              {loadingAttendance ? (
                <p className="text-gray-600 mt-1">Loading...</p>
              ) : attendanceStatus ? (
                <div className="mt-1">
                  <p className="text-gray-900 font-medium">Status: {getStatusText(attendanceStatus.status)}</p>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs sm:text-sm">
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold">
                      FN: {getSessionStatusText(attendanceStatus.fn_status)}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 font-semibold">
                      AN: {getSessionStatusText(attendanceStatus.an_status)}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-sm text-gray-600">
                    {attendanceStatus.morning_in && (
                      <span>In: {attendanceStatus.morning_in}</span>
                    )}
                    {attendanceStatus.evening_out && (
                      <span>Out: {attendanceStatus.evening_out}</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-gray-600 mt-1">Unable to load attendance status</p>
              )}
            </div>
          </div>
        </div>
      )}

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
