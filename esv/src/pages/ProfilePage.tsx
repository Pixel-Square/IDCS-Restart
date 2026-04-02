import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assigningUpdateEventName, type FacultyAllocation } from '../stores/coeStore';
import { fetchFacultyAllocations } from '../services/assignments';

export default function ProfilePage() {
  const navigate = useNavigate();
  const facultyCode = sessionStorage.getItem('esv-faculty-code') || '';
  const [facultyName, setFacultyName] = useState('');
  const [allocations, setAllocations] = useState<FacultyAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!facultyCode) {
      navigate('/', { replace: true });
      return;
    }

    let active = true;

    const loadAllocations = async () => {
      setLoadingAllocations(true);
      try {
        const results = await fetchFacultyAllocations(facultyCode);
        if (!active) return;
        setAllocations(results);
        const firstName = results.find((item) => item.facultyName)?.facultyName || '';
        if (firstName) {
          setFacultyName(firstName);
        }
      } finally {
        if (active) {
          setLoadingAllocations(false);
        }
      }
    };

    void loadAllocations();

    return () => {
      active = false;
    };
  }, [facultyCode, navigate, refreshTrigger]);

  useEffect(() => {
    const handleAssignmentsChange = () => {
      setRefreshTrigger(prev => prev + 1);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'coe-assigning-v1' || e.key === null) {
        handleAssignmentsChange();
      }
    };

    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('coe-assigning-updates-v1')
      : null;

    const handleBroadcastMessage = (event: MessageEvent) => {
      if (event.data === 'updated') {
        handleAssignmentsChange();
      }
    };

    window.addEventListener(assigningUpdateEventName, handleAssignmentsChange);
    window.addEventListener('storage', handleStorageChange);
    channel?.addEventListener('message', handleBroadcastMessage);

    return () => {
      window.removeEventListener(assigningUpdateEventName, handleAssignmentsChange);
      window.removeEventListener('storage', handleStorageChange);
      channel?.removeEventListener('message', handleBroadcastMessage);
      channel?.close();
    };
  }, []);

  useEffect(() => {
    // Find name from allocations
    const foundAllocation = allocations.find(a => a.scripts > 0 || (a.bundles && a.bundles.length > 0));
    if (foundAllocation?.facultyName) {
      setFacultyName(foundAllocation.facultyName);
    } else {
      setFacultyName('');
    }
  }, [allocations]);

  const handleManualRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('esv-faculty-code');
    navigate('/', { replace: true });
  };

  if (!facultyCode) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-[#d9b7ac]">
        <div className="h-32 bg-gradient-to-r from-[#6f1d34] to-[#a3462d]"></div>
        <div className="px-8 pb-8">
          <div className="relative flex justify-between items-end -mt-12 mb-6">
            <div className="w-24 h-24 rounded-2xl bg-white border-4 border-white shadow-lg flex items-center justify-center text-[#6f1d34] group relative overflow-hidden">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <button 
                onClick={handleManualRefresh}
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                title="Refresh assignments"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-50 text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-100 font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-[#5a192f]">{facultyName || 'Faculty'}</h1>
              <p className="text-lg text-[#6f4a3f]">Faculty ID: <span className="font-mono font-bold">{facultyCode}</span></p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl bg-[#faf4f0] border border-[#d9b7ac]">
                <h3 className="text-sm font-semibold text-[#6f4a3f] uppercase tracking-wider mb-2">Total Allocations</h3>
                  <p className="text-3xl font-bold text-[#b2472e]">{loadingAllocations ? '...' : allocations.length}</p>
              </div>
              <div className="p-6 rounded-xl bg-[#faf4f0] border border-[#d9b7ac]">
                <h3 className="text-sm font-semibold text-[#6f4a3f] uppercase tracking-wider mb-2">Total Scripts</h3>
                <p className="text-3xl font-bold text-[#b2472e]">
                  {loadingAllocations ? '...' : allocations.reduce((sum, a) => sum + (a.scripts || 0), 0)}
                </p>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100">
              <h3 className="text-lg font-bold text-[#5a192f] mb-4">Assigned Courses & Bundles</h3>
              <div className="space-y-4">
                {loadingAllocations ? (
                  <p className="text-gray-500 italic text-center py-8">Refreshing assignments...</p>
                ) : allocations.length === 0 ? (
                  <p className="text-gray-500 italic text-center py-8">No courses currently assigned. If you just received an assignment, please try refreshing.</p>
                ) : (
                  allocations.map((a, idx) => {
                    const courseName = a.courseKey.split('::')[3] || 'Course';
                    const courseCode = a.courseKey.split('::')[2] || '';
                    return (
                      <div key={idx} className="rounded-xl border border-[#ead7d0] bg-white overflow-hidden shadow-sm">
                        <div className="bg-[#faf4f0] px-4 py-3 border-b border-[#ead7d0] flex justify-between items-center">
                          <div>
                            <p className="font-bold text-[#5a192f]">{courseName}</p>
                            <p className="text-[10px] font-medium text-[#6f4a3f] uppercase tracking-wider">{courseCode} &middot; {a.department} &middot; {a.semester}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#6f1d34] text-white">
                              {a.date}
                            </span>
                          </div>
                        </div>
                        <div className="p-4">
                          {a.bundles && a.bundles.length > 0 ? (
                            <div className="space-y-2">
                              {a.bundles.map((b, bIdx) => (
                                <div key={bIdx} className="flex items-center justify-between text-sm py-1 border-b border-dashed border-gray-100 last:border-0">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#b2472e]"></div>
                                    <span className="font-mono font-bold text-[#a3462d]">{b.name}</span>
                                  </div>
                                  <span className="font-semibold text-[#6f4a3f]">{b.scripts} Scripts</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-[#6f4a3f] font-medium italic">General Allocation</span>
                              <span className="font-bold text-[#b2472e]">{a.scripts} Scripts</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
