import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type FacultyAllocation } from '../stores/coeStore';
import { fetchFacultyAllocations } from '../services/assignments';
import { submitResetRequest } from '../services/requests';
import { RotateCcw, LogOut, User, Shield, Briefcase, AlertCircle } from 'lucide-react';

export default function ProfilePage() {
  const navigate = useNavigate();
  const facultyCode = sessionStorage.getItem('esv-faculty-code') || '';
  const [facultyName, setFacultyName] = useState('');
  const [allocations, setAllocations] = useState<FacultyAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [resetStatus, setResetStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

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
      } catch (err) {
        console.error('Failed to load allocations:', err);
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

  const handleManualRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleResetRequest = async () => {
    if (!window.confirm('Are you sure you want to request a complete reset of all your ESV valuations? This action requires COE approval.')) {
      return;
    }

    setResetStatus('submitting');
    try {
      await submitResetRequest(facultyCode, facultyName);
      setResetStatus('success');
      window.alert('Reset request submitted to COE. Once approved, your data will be cleared.');
    } catch (err) {
      console.error('Reset request failed:', err);
      setResetStatus('error');
    } finally {
      setTimeout(() => setResetStatus('idle'), 3000);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('esv-faculty-code');
    navigate('/', { replace: true });
  };

  if (!facultyCode) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white rounded-3xl border border-[#ead7d0] shadow-[0_8px_30px_-12px_rgba(111,29,52,0.15)] overflow-hidden">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-[#6f1d34] to-[#a3462d] p-8 text-white relative">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30 shadow-inner group relative overflow-hidden">
               <User size={48} className="text-white" />
               <button 
                onClick={handleManualRefresh}
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                title="Refresh assignments"
              >
                <RotateCcw size={24} className={loadingAllocations ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-3xl font-black tracking-tight">{facultyName || 'Faculty Member'}</h1>
              <p className="text-white/80 font-medium mt-1 flex items-center justify-center md:justify-start gap-2">
                <Shield size={14} />
                Faculty Code: <span className="font-bold underline decoration-white/30">{facultyCode}</span>
              </p>
            </div>
            <div className="md:ml-auto flex gap-3">
              <button
                onClick={handleLogout}
                className="bg-white/10 hover:bg-white/20 border border-white/30 text-white px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 font-bold text-sm shadow-sm"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <div className="space-y-4">
                <h2 className="text-xs font-black text-[#6f4a3f]/50 uppercase tracking-[0.2em] px-1">Statistics</h2>
                <div className="bg-[#faf4f0] border border-[#ead7d0] rounded-2xl p-5 flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl border border-[#ead7d0] flex items-center justify-center shadow-sm">
                    <Briefcase size={20} className="text-[#6f1d34]" />
                  </div>
                  <div>
                    <p className="text-xl font-black text-[#5a192f]">{loadingAllocations ? '...' : allocations.length}</p>
                    <p className="text-[10px] font-bold text-[#6f4a3f]/70 uppercase tracking-widest">Active Courses</p>
                  </div>
                </div>
                <div className="bg-[#faf4f0] border border-[#ead7d0] rounded-2xl p-5 flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl border border-[#ead7d0] flex items-center justify-center shadow-sm">
                    <div className="font-bold text-[#6f1d34]">#</div>
                  </div>
                  <div>
                    <p className="text-xl font-black text-[#5a192f]">
                      {loadingAllocations ? '...' : allocations.reduce((sum, a) => sum + (a.scripts || 0), 0)}
                    </p>
                    <p className="text-[10px] font-bold text-[#6f4a3f]/70 uppercase tracking-widest">Total Scripts</p>
                  </div>
                </div>
             </div>

             <div className="space-y-4 lg:col-span-2">
                <h2 className="text-xs font-black text-[#6f4a3f]/50 uppercase tracking-[0.2em] px-1">Danger Zone</h2>
                <button
                  onClick={handleResetRequest}
                  disabled={resetStatus === 'submitting'}
                  className="w-full bg-white border-2 border-[#6f1d34]/10 hover:border-[#6f1d34] hover:bg-[#6f1d34]/5 text-[#6f1d34] p-6 rounded-2xl transition-all flex items-center gap-4 group disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-[#6f1d34]/10 rounded-xl flex items-center justify-center group-hover:bg-[#6f1d34] group-hover:text-white transition-all">
                    <RotateCcw className={resetStatus === 'submitting' ? 'animate-spin' : ''} />
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-black leading-tight">Request Reset</p>
                    <p className="text-xs font-bold text-[#6f4a3f]/70 uppercase tracking-widest">Restart valuation from scratch</p>
                  </div>
                </button>
             </div>
          </div>

          <div className="bg-yellow-50/50 border border-yellow-100 rounded-2xl p-6">
             <div className="flex gap-4">
                <AlertCircle className="text-yellow-600 shrink-0" size={24} />
                <div>
                   <h3 className="text-sm font-black text-yellow-800 uppercase tracking-wider mb-1">Important Notice</h3>
                   <p className="text-sm text-yellow-700/80 font-medium">Resetting your valuation will permanently delete all marks entered for your currently allocated course bundles. This action cannot be undone and requires approval from the COE office.</p>
                </div>
             </div>
          </div>

          {/* Detailed Allocations */}
          <div className="pt-4">
            <h3 className="text-xs font-black text-[#6f4a3f]/50 uppercase tracking-[0.2em] px-1 mb-4">Assigned Courses & Bundles</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loadingAllocations ? (
                <p className="col-span-full text-gray-500 italic text-center py-8">Refreshing assignments...</p>
              ) : allocations.length === 0 ? (
                <p className="col-span-full text-gray-500 italic text-center py-8">No courses currently assigned.</p>
              ) : (
                allocations.map((a, idx) => {
                  const courseName = a.courseKey.split('::')[3] || 'Course';
                  const courseCode = a.courseKey.split('::')[2] || '';
                  return (
                    <div key={idx} className="rounded-2xl border border-[#ead7d0] bg-white overflow-hidden shadow-sm">
                      <div className="bg-[#faf4f0] px-4 py-3 border-b border-[#ead7d0] flex justify-between items-center">
                        <div>
                          <p className="font-bold text-[#5a192f] text-sm">{courseName}</p>
                          <p className="text-[9px] font-bold text-[#6f4a3f]/60 uppercase tracking-wider">{courseCode} &middot; {a.semester}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6f1d34] text-white">
                          {a.date}
                        </span>
                      </div>
                      <div className="p-4">
                        {a.bundles && a.bundles.length > 0 ? (
                          <div className="space-y-2">
                            {a.bundles.map((b, bIdx) => (
                              <div key={bIdx} className="flex items-center justify-between text-xs py-1 border-b border-dashed border-gray-100 last:border-0">
                                <span className="font-mono font-bold text-[#a3462d]">{b.name}</span>
                                <span className="font-semibold text-[#6f4a3f]">{b.scripts} Scripts</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex justify-between items-center text-xs">
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
  );
}
