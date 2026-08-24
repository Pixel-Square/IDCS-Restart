import React, { useState, useEffect } from 'react';
import { User, BookOpen, GraduationCap, Calendar, Clock, CheckCircle, XCircle, AlertCircle, Bell, ArrowRight, X, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';
import fetchWithAuth from '../../services/fetchAuth';
import { useNavigate } from 'react-router-dom';

interface DashboardEntryPointsProps {
  user?: any;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  target_type: 'ALL' | 'DEPARTMENT' | 'CLASS' | 'ROLE';
  created_by_name: string;
  created_at: string;
  is_read: boolean;
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
  const navigate = useNavigate();
  const username = user?.username || 'User';
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [avatarCandidateIndex, setAvatarCandidateIndex] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [popupAnnouncement, setPopupAnnouncement] = useState<Announcement | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);

  const rootAvatarValue = String((user as any)?.profile_image || '').trim();
  const nestedAvatarValue = String((user as any)?.profile?.profile_image || '').trim();
  const avatarSourceValue = rootAvatarValue || nestedAvatarValue;

  const avatarUrlCandidates = React.useMemo(() => {
    const raw = avatarSourceValue;
    if (!raw) return [] as string[];

    const normalized = raw.replace(/\\+/g, '/');
    if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('blob:') || normalized.startsWith('data:')) {
      return [normalized];
    }

    if (normalized.startsWith('/')) {
      // Use relative path first; avoid duplicate absolute+relative retries for the same resource.
      return [normalized];
    }

    const direct = `/media/${normalized}`;
    const apiBaseUrl = `${getApiBase()}/media/${normalized}`;
    const unique = new Set<string>();
    for (const candidate of [direct, apiBaseUrl]) {
      const value = String(candidate || '').trim();
      if (value) unique.add(value);
    }
    return Array.from(unique);
  }, [avatarSourceValue]);

  useEffect(() => {
    setAvatarCandidateIndex(0);
  }, [avatarSourceValue]);

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
  const rawRoles = Array.isArray(user?.roles) ? user.roles : [];
  const upperRoles = rawRoles.map((r: any) => (typeof r === 'string' ? r : r?.name || '').toUpperCase());
  const profileTypeUpper = String(user?.profile_type || '').toUpperCase();
  const isStaff = profileTypeUpper === 'STAFF' || upperRoles.includes('STAFF') || Boolean(user?.is_staff);
  const isStudent = profileTypeUpper === 'STUDENT' || upperRoles.includes('STUDENT') || Boolean(user?.is_student) || (!isStaff && Boolean(user?.student_profile));

  // BioSecure State
  const [biosecureStatus, setBiosecureStatus] = useState<any>(null);
  const [biosecureCurrentBatch, setBiosecureCurrentBatch] = useState<any>(null);
  const [biosecureNextBatch, setBiosecureNextBatch] = useState<any>(null);
  const [biosecureTimerText, setBiosecureTimerText] = useState<string>('');

  const fetchBioSecureStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/idscan/biosecure/student/status/');
      if (res && res.ok) {
        const data = await res.json();
        setBiosecureStatus(data);
        setBiosecureCurrentBatch(data.current_batch || null);
        setBiosecureNextBatch(data.next_batch || null);
      }
    } catch (err) {
      console.error('Failed to fetch BioSecure status:', err);
    }
  };

  // Real-time Countdown Timer for BioSecure Batch
  useEffect(() => {
    if (!isStudent || !biosecureStatus?.active) return;

    const updateTimer = () => {
      const now = new Date();
      if (biosecureCurrentBatch) {
        // Countdown until current active batch ends
        const endDt = new Date(biosecureCurrentBatch.end_iso);
        const diffMs = endDt.getTime() - now.getTime();
        if (diffMs > 0) {
          const totalSecs = Math.floor(diffMs / 1000);
          const hrs = Math.floor(totalSecs / 3600);
          const mins = Math.floor((totalSecs % 3600) / 60);
          const secs = totalSecs % 60;
          setBiosecureTimerText(
            `${hrs > 0 ? `${hrs}h ` : ''}${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
          );
        } else {
          // Batch ended: refresh status to transition to next batch timer
          fetchBioSecureStatus();
        }
      } else if (biosecureNextBatch) {
        // Countdown until next batch starts
        const startDt = new Date(biosecureNextBatch.start_iso);
        const diffMs = startDt.getTime() - now.getTime();
        if (diffMs > 0) {
          const totalSecs = Math.floor(diffMs / 1000);
          const hrs = Math.floor(totalSecs / 3600);
          const mins = Math.floor((totalSecs % 3600) / 60);
          const secs = totalSecs % 60;
          setBiosecureTimerText(
            `${hrs > 0 ? `${hrs}h ` : ''}${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
          );
        } else {
          // Next batch started: refresh status to make it active
          fetchBioSecureStatus();
        }
      } else {
        setBiosecureTimerText('');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isStudent, biosecureStatus, biosecureCurrentBatch, biosecureNextBatch]);

  // Fetch today's attendance status for staff, BioSecure for student, and announcements
  useEffect(() => {
    if (isStaff) {
      fetchTodayAttendance();
    }
    if (isStudent) {
      fetchBioSecureStatus();
      
      // Real-time live polling for student BioSecure scan updates without requiring page refresh
      const pollInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchBioSecureStatus();
        }
      }, 3000); // Check every 3 seconds for instant live updates upon fingerprint placement

      const handleVisibilityOrFocus = () => {
        if (document.visibilityState === 'visible') {
          fetchBioSecureStatus();
        }
      };

      window.addEventListener('focus', handleVisibilityOrFocus);
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);

      return () => {
        clearInterval(pollInterval);
        window.removeEventListener('focus', handleVisibilityOrFocus);
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      };
    }
    fetchRecentAnnouncements();
  }, [isStaff, isStudent]);

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

  const fetchRecentAnnouncements = async () => {
    try {
      setLoadingAnnouncements(true);
      const url = `${getApiBase()}/api/announcements/announcements/?page=1&page_size=2`;
      const response = await apiClient.get(url);
      const data: Announcement[] = Array.isArray(response.data)
        ? response.data
        : (response.data?.results || []);
      const recent = data.slice(0, 2);
      setAnnouncements(recent);

      const latestUnread = recent.find((announcement) => !announcement.is_read) || null;
      setPopupAnnouncement(latestUnread);
      setShowPopup(Boolean(latestUnread));
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      setAnnouncements([]);
    } finally {
      setLoadingAnnouncements(false);
    }
  };

  const markAnnouncementRead = async (announcementId: string) => {
    setMarkingReadId(announcementId);
    try {
      await apiClient.post(`${getApiBase()}/api/announcements/announcements/${announcementId}/mark-read/`);
      setAnnouncements((prev) => prev.map((item) => (
        item.id === announcementId ? { ...item, is_read: true } : item
      )));
      setPopupAnnouncement((prev) => (prev && prev.id === announcementId ? null : prev));
      setShowPopup(false);
    } catch (error) {
      console.error('Failed to mark announcement as read:', error);
    } finally {
      setMarkingReadId(null);
    }
  };

  const handlePopupView = async () => {
    if (!popupAnnouncement) return;
    await markAnnouncementRead(popupAnnouncement.id);
    navigate('/announcements');
  };

  const handlePopupDismiss = async () => {
    if (!popupAnnouncement) {
      setShowPopup(false);
      return;
    }
    await markAnnouncementRead(popupAnnouncement.id);
  };

  const unreadCount = announcements.filter((ann) => !ann.is_read).length;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  return (
    <div className="space-y-6">
      <div
        className={`fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-50 w-[calc(100vw-2rem)] sm:w-[360px] transition-all duration-300 ${
          showPopup && popupAnnouncement ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="rounded-xl bg-white border border-gray-200 shadow-lg px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{popupAnnouncement?.title}</p>
              <p className="text-xs text-gray-600 mt-1 truncate">{popupAnnouncement?.content}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePopupView}
                  disabled={markingReadId === popupAnnouncement?.id}
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={handlePopupDismiss}
                  disabled={markingReadId === popupAnnouncement?.id}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePopupDismiss}
              disabled={markingReadId === popupAnnouncement?.id}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-60"
              aria-label="Dismiss announcement"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 sm:p-8 shadow-md">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
            {currentAvatarUrl ? (
              <img
                src={currentAvatarUrl}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  setAvatarCandidateIndex((prev) => {
                    const next = prev + 1;
                    return next < avatarUrlCandidates.length ? next : avatarUrlCandidates.length;
                  });
                }}
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

      {/* ── BIOSECURE ATTENDANCE & LIVE BATCH TIMER FOR STUDENTS ── */}
      {isStudent && biosecureStatus?.active && (
        <div
          onClick={() => navigate('/biosecure/student/logs')}
          className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-5 sm:p-6 text-white shadow-md border border-slate-700/60 hover:border-emerald-500/50 transition-all cursor-pointer group"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Icon Container */}
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                biosecureCurrentBatch
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
              }`}>
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
                    BioSecure Attendance
                  </span>
                  {biosecureStatus?.group_name && (
                    <span className="text-xs font-semibold text-slate-300">
                      Group: <span className="text-white font-bold">{biosecureStatus.group_name}</span>
                    </span>
                  )}
                </div>

                <div className="mt-1.5">
                  {biosecureCurrentBatch ? (
                    <p className="text-sm font-medium text-slate-200">
                      Active Batch:{' '}
                      <span className="text-amber-300 font-bold">{biosecureCurrentBatch.name}</span>{' '}
                      <span className="text-slate-400 font-normal text-xs">({biosecureCurrentBatch.start_time} - {biosecureCurrentBatch.end_time})</span>
                    </p>
                  ) : biosecureNextBatch ? (
                    <p className="text-sm font-medium text-slate-200">
                      Next Scheduled Batch:{' '}
                      <span className="text-emerald-300 font-bold">{biosecureNextBatch.name}</span>{' '}
                      <span className="text-slate-400 font-normal text-xs">({biosecureNextBatch.start_time} - {biosecureNextBatch.end_time})</span>
                    </p>
                  ) : biosecureStatus?.active ? (
                    <p className="text-sm text-slate-300 font-normal">All BioSecure biometric batches for today completed.</p>
                  ) : (
                    <p className="text-sm text-slate-300 font-normal">View your BioSecure biometric timeline and attendance logs.</p>
                  )}
                </div>

                {/* Fingerprint placement status for active session */}
                {biosecureCurrentBatch && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    {biosecureCurrentBatch.placed ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        Fingerprint placed on scanner ({biosecureCurrentBatch.verified_at || 'Verified'})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-300 font-medium border border-rose-500/30">
                        <Clock className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                        Attendance Pending: Place your finger on classroom scanner
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Timers & Click Affordance */}
            <div className="flex items-center gap-4 self-start md:self-auto">
              {/* Active Running Batch Timer */}
              {biosecureCurrentBatch && biosecureTimerText && (
                <div className="px-3.5 py-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 flex items-center gap-2.5 shadow-inner">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-rose-400">
                      Batch Ends In
                    </p>
                    <p className="text-sm font-black font-mono text-rose-100 leading-tight">
                      {biosecureTimerText}
                    </p>
                  </div>
                </div>
              )}

              {/* Next Upcoming Batch Timer */}
              {!biosecureCurrentBatch && biosecureNextBatch && biosecureTimerText && (
                <div className="px-3.5 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-2.5 shadow-inner">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                      Starts In
                    </p>
                    <p className="text-sm font-black font-mono text-emerald-100 leading-tight">
                      {biosecureTimerText}
                    </p>
                  </div>
                </div>
              )}

              {/* Subtle navigation arrow icon indicating clickable card */}
              <div className="hidden sm:flex w-9 h-9 rounded-xl bg-white/10 group-hover:bg-white/20 border border-white/10 items-center justify-center text-slate-300 group-hover:text-white transition transform group-hover:translate-x-0.5">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Announcements Section */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Announcements</h3>
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center px-3 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/announcements')}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
          >
            View All
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loadingAnnouncements ? (
          <div className="text-center py-6 text-gray-500">
            <Clock className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading announcements...
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <p>No announcements at this time</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className={`p-4 rounded-lg border-l-4 transition-all ${
                  announcement.is_read
                    ? 'bg-gray-50 border-l-gray-300'
                    : 'bg-blue-50 border-l-blue-600'
                }`}
                style={{
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                    announcement.is_read ? 'bg-gray-400' : 'bg-blue-600'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 truncate">{announcement.title}</h4>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{announcement.content}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                      <span>{formatDate(announcement.created_at)}</span>
                      <span>by {announcement.created_by_name}</span>
                    </div>
                  </div>
                  {!announcement.is_read && (
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
