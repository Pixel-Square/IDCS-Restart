import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Archive, Upload, Activity, ChevronLeft, ChevronRight, CheckCircle, XCircle, Loader2, Clock, AlertTriangle, FileJson, Server, Settings } from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';

interface Section {
  section_id: string;
  display_name: string;
  supports_config?: boolean;
  latest_snapshot?: {
    timestamp: string;
    status: string;
    actor_name: string;
  } | null;
  latest_config_export?: {
    timestamp: string;
    status: string;
    actor_name: string;
    export_type: string;
  } | null;
}

interface ActivityLog {
  id: string;
  action_type: string;
  action_type_display: string;
  section_id: string;
  section_display_name: string;
  actor_name: string;
  timestamp: string;
  success: boolean;
  detail: string;
  related_snapshot_id: string | null;
  related_export_id: string | null;
}

interface ConfigExport {
  id: string;
  status: string;
  timestamp: string;
  file_reference: string;
  export_type: string;
  academic_year: string | null;
  semester_label: string | null;
}

interface JobState {
  task_id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  detail: string;
}

// Hook that polls a task until terminal state
function useTaskPoller(onComplete?: () => void) {
  const [jobs, setJobs] = useState<JobState[]>([]);
  const pollers = useRef<Record<string, NodeJS.Timeout>>({});

  const addJob = useCallback((task_id: string, label: string) => {
    setJobs(prev => [...prev.filter(j => j.task_id !== task_id), { task_id, label, status: 'pending', detail: '' }]);

    const poll = () => {
      fetchWithAuth(`/api/backups-logs/status/${task_id}/`)
        .then(r => r.json())
        .then(data => {
          const s: JobState['status'] = data.status;
          setJobs(prev => prev.map(j => j.task_id === task_id ? { ...j, status: s, detail: data.detail || '' } : j));

          if (s === 'success' || s === 'failed') {
            clearTimeout(pollers.current[task_id]);
            delete pollers.current[task_id];
            onComplete?.();
          } else {
            pollers.current[task_id] = setTimeout(poll, 2000);
          }
        })
        .catch(() => {
          pollers.current[task_id] = setTimeout(poll, 3000);
        });
    };

    pollers.current[task_id] = setTimeout(poll, 1000);
  }, [onComplete]);

  // Cleanup on unmount
  useEffect(() => () => { Object.values(pollers.current).forEach(clearTimeout); }, []);

  return { jobs, addJob };
}

function StatusBadge({ status, detail }: { status: JobState['status'], detail: string }) {
  if (status === 'pending' || status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <Loader2 className="w-3 h-3 animate-spin" />
        {status === 'pending' ? 'Queued…' : 'Running…'}
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="w-3 h-3" /> Done
      </span>
    );
  }
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XCircle className="w-3 h-3" /> Failed
      </span>
      {detail && <p className="text-xs text-red-700 mt-1 max-w-xs">{detail}</p>}
    </div>
  );
}

function JobStatusPanel({ jobs }: { jobs: JobState[] }) {
  if (jobs.length === 0) return null;
  return (
    <div className="mb-6 space-y-2">
      {jobs.map(job => (
        <div key={job.task_id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-700">{job.label}</span>
            <span className="text-gray-400 text-xs font-mono truncate max-w-[160px]">{job.task_id.slice(0, 8)}…</span>
          </div>
          <StatusBadge status={job.status} detail={job.detail} />
        </div>
      ))}
    </div>
  );
}

function ConfirmationDialog({ 
  isOpen, title, message, confirmText = 'Confirm', onConfirm, onCancel, isDestructive = false 
}: { 
  isOpen: boolean; title: string; message: string; confirmText?: string; onConfirm: () => void; onCancel: () => void; isDestructive?: boolean;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            {isDestructive ? <AlertTriangle className="w-6 h-6 text-red-600" /> : <Archive className="w-6 h-6 text-blue-600" />}
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          </div>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{message}</p>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffPreview({ diff }: { diff: any }) {
  if (!diff) return null;
  const { added = [], updated = [], removed = [] } = diff;
  const hasChanges = added.length > 0 || updated.length > 0 || removed.length > 0;
  
  if (!hasChanges) {
    return (
      <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
        No changes detected.
      </div>
    );
  }
  
  return (
    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
      {added.length > 0 && (
        <div className="border border-green-200 rounded-lg overflow-hidden shadow-sm">
          <div className="bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 border-b border-green-200">Added ({added.length})</div>
          <ul className="divide-y divide-green-100 bg-white">
            {added.map((item: string, i: number) => <li key={i} className="px-3 py-2 text-xs font-mono text-green-700">{item}</li>)}
          </ul>
        </div>
      )}
      {updated.length > 0 && (
        <div className="border border-blue-200 rounded-lg overflow-hidden shadow-sm">
          <div className="bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 border-b border-blue-200">Updated ({updated.length})</div>
          <ul className="divide-y divide-blue-100 bg-white">
            {updated.map((item: string, i: number) => <li key={i} className="px-3 py-2 text-xs font-mono text-blue-700">{item}</li>)}
          </ul>
        </div>
      )}
      {removed.length > 0 && (
        <div className="border border-red-200 rounded-lg overflow-hidden shadow-sm">
          <div className="bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 border-b border-red-200">Removed ({removed.length})</div>
          <ul className="divide-y divide-red-100 bg-white">
            {removed.map((item: string, i: number) => <li key={i} className="px-3 py-2 text-xs font-mono text-red-700">{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function BackupsLogsPage() {
  const [activeTab, setActiveTab] = useState<'modules' | 'activity' | 'archives'>('modules');
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);

  // Dialog States
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void, isDestructive?: boolean}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  const [diffState, setDiffState] = useState<{isOpen: boolean, title: string, diff: any, onConfirm?: () => void}>({isOpen: false, title: '', diff: null});

  // Activity Log State
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filterSection, setFilterSection] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSuccess, setFilterSuccess] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterActor, setFilterActor] = useState('');

  // Archives State
  const [archives, setArchives] = useState<ConfigExport[]>([]);
  const [archivesLoading, setArchivesLoading] = useState(false);

  const fetchLogs = useCallback(() => {
    setLogsLoading(true);
    const params = new URLSearchParams();
    params.append('page', page.toString());
    if (filterSection) params.append('section_id', filterSection);
    if (filterAction) params.append('action_type', filterAction);
    if (filterSuccess) params.append('success', filterSuccess);
    if (filterDateFrom) params.append('date_from', filterDateFrom);
    if (filterDateTo) params.append('date_to', filterDateTo);
    if (filterActor) params.append('actor', filterActor);

    fetchWithAuth(`/api/backups-logs/activity/?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setLogs(data.results || []);
        setTotalPages(Math.ceil((data.count || 0) / 20) || 1);
      })
      .catch(console.error)
      .finally(() => setLogsLoading(false));
  }, [page, filterSection, filterAction, filterSuccess, filterDateFrom, filterDateTo, filterActor]);

  // Refresh logs on job completion (so new ActivityLog entries appear)
  const { jobs, addJob } = useTaskPoller(fetchLogs);

  useEffect(() => {
    fetchWithAuth('/api/backups-logs/landing/')
      .then(res => res.json())
      .then(data => { if (data.sections) setSections(data.sections); })
      .catch(console.error)
      .finally(() => setLoadingSections(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'activity') fetchLogs();
  }, [activeTab, fetchLogs]);

  useEffect(() => {
    if (activeTab === 'archives') {
      setArchivesLoading(true);
      fetchWithAuth('/api/backups-logs/config-exports/feedback/?export_type=semester_archive')
        .then(r => r.json())
        .then(data => setArchives(data || []))
        .catch(console.error)
        .finally(() => setArchivesLoading(false));
    }
  }, [activeTab]);

  // Generic trigger helper
  const trigger = (url: string, label: string, opts?: RequestInit) => {
    fetchWithAuth(url, { method: 'POST', ...opts })
      .then(async r => {
        const data = await r.json();
        if (data.task_id) {
          addJob(data.task_id, label);
        } else if (data.error) {
          alert(`Error: ${data.error}`);
        }
      })
      .catch(err => alert(`Network error: ${err.message}`));
  };

  const confirmAndTrigger = (url: string, label: string, confirmMsg: string, opts?: RequestInit, isDestructive: boolean = false) => {
    setConfirmState({
      isOpen: true,
      title: label,
      message: confirmMsg,
      isDestructive,
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        trigger(url, label, opts);
      }
    });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'activity':
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" /> System Activity Logs
            </h2>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Module</label>
                <select className="w-full text-sm border-gray-300 rounded-md shadow-sm" value={filterSection} onChange={e => { setFilterSection(e.target.value); setPage(1); }}>
                  <option value="">All</option>
                  {sections.map(s => <option key={s.section_id} value={s.section_id}>{s.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Action Type</label>
                <select className="w-full text-sm border-gray-300 rounded-md shadow-sm" value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1); }}>
                  <option value="">All</option>
                  <option value="backup">Backup</option>
                  <option value="restore">Restore</option>
                  <option value="config_export">Config Export</option>
                  <option value="config_import">Config Import</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select className="w-full text-sm border-gray-300 rounded-md shadow-sm" value={filterSuccess} onChange={e => { setFilterSuccess(e.target.value); setPage(1); }}>
                  <option value="">All</option>
                  <option value="true">Success</option>
                  <option value="false">Failed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Actor Search</label>
                <input type="text" placeholder="Email or Name" className="w-full text-sm border-gray-300 rounded-md shadow-sm" value={filterActor} onChange={e => { setFilterActor(e.target.value); setPage(1); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
                <input type="date" className="w-full text-sm border-gray-300 rounded-md shadow-sm" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
                <input type="date" className="w-full text-sm border-gray-300 rounded-md shadow-sm" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logsLoading ? (
                    <tr><td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">Loading logs…</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">No activity logs found.</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className={log.success ? 'hover:bg-gray-50' : 'bg-red-50 hover:bg-red-100'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.actor_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{log.section_display_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.action_type_display}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {log.success ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" /> Success</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3" /> Failed</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {log.detail}
                        {log.related_snapshot_id && <div className="text-xs text-blue-600 mt-1 cursor-pointer" onClick={() => alert(`Related Snapshot ID:\n${log.related_snapshot_id}`)}>View Snapshot ID</div>}
                        {log.related_export_id && <div className="text-xs text-blue-600 mt-1 cursor-pointer" onClick={() => alert(`Related Export ID:\n${log.related_export_id}`)}>View Export ID</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 mt-4">
              <p className="text-sm text-gray-700">Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span></p>
              <nav className="inline-flex -space-x-px rounded-md shadow-sm">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </nav>
            </div>
          </div>
        );

      case 'modules':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-600" /> Module Backup & Configuration
              </h2>
            </div>
            
            <JobStatusPanel jobs={jobs} />

            {loadingSections ? (
              <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
                Loading modules...
              </div>
            ) : sections.length === 0 ? (
              <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-gray-100 shadow-sm">
                No modules registered for backup.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {sections.map(s => (
                  <div key={s.section_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                      <h3 className="font-bold text-gray-900 text-lg">{s.display_name}</h3>
                      <span className="px-2.5 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded-full font-mono">{s.section_id}</span>
                    </div>
                    
                    <div className="p-6 flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                      
                      {/* Raw Data Panel */}
                      <div className="md:pr-6 flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                          <Archive className="w-4 h-4 text-blue-600" />
                          <h4 className="font-semibold text-gray-800">Raw Data Snapshots</h4>
                        </div>
                        
                        <div className="text-sm text-gray-600 flex-grow mb-4">
                          {s.latest_snapshot ? (
                            <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100/50">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Latest Backup</span>
                                <StatusBadge status={s.latest_snapshot.status as any} detail="" />
                              </div>
                              <p className="font-medium text-gray-900">{new Date(s.latest_snapshot.timestamp).toLocaleString()}</p>
                              <p className="text-xs text-gray-500 mt-1">by {s.latest_snapshot.actor_name}</p>
                            </div>
                          ) : (
                            <p className="italic text-gray-400">No raw snapshots found.</p>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-2 mt-auto">
                          <button 
                            onClick={() => confirmAndTrigger(`/api/backups-logs/snapshot/${s.section_id}/`, `Backup ${s.display_name}`, `Trigger a new raw data snapshot for ${s.display_name}?`, undefined, false)}
                            className="w-full px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                          >
                            Trigger Backup Now
                          </button>
                          <button 
                            onClick={() => {
                              setFilterSection(s.section_id);
                              setFilterAction('backup');
                              setActiveTab('activity');
                              setPage(1);
                            }}
                            className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-white rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                          >
                            View All Snapshots
                          </button>
                        </div>
                      </div>

                      {/* Config Panel */}
                      <div className="pt-6 md:pt-0 md:pl-6 flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                          <Settings className="w-4 h-4 text-purple-600" />
                          <h4 className="font-semibold text-gray-800">Configuration</h4>
                        </div>
                        
                        {s.supports_config ? (
                          <>
                            <div className="text-sm text-gray-600 flex-grow mb-4">
                              {s.latest_config_export ? (
                                <div className="bg-purple-50/50 rounded-lg p-3 border border-purple-100/50">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Latest Export</span>
                                    <StatusBadge status={s.latest_config_export.status as any} detail="" />
                                  </div>
                                  <p className="font-medium text-gray-900">{new Date(s.latest_config_export.timestamp).toLocaleString()}</p>
                                  <p className="text-xs text-gray-500 mt-1">by {s.latest_config_export.actor_name}</p>
                                </div>
                              ) : (
                                <p className="italic text-gray-400">No config exports found.</p>
                              )}
                            </div>
                            
                            <div className="flex flex-col gap-2 mt-auto">
                              <button 
                                onClick={() => confirmAndTrigger(`/api/backups-logs/config-export/${s.section_id}/`, `Export ${s.display_name} Config`, `Trigger a new config export for ${s.display_name}?`, undefined, false)}
                                className="w-full px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200"
                              >
                                Export Config Now
                              </button>
                              <button 
                                onClick={() => {
                                  setFilterSection(s.section_id);
                                  setFilterAction('config_export');
                                  setActiveTab('activity');
                                  setPage(1);
                                }}
                                className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-white rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                              >
                                View All Config Exports
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex-grow flex items-center justify-center p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                            <p className="text-sm text-gray-400 text-center">Config export not available for this section</p>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
        
      case 'archives':
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Archive className="w-5 h-5 text-indigo-600" /> Browse by Semester/Year (Feedback Configs)
              </h2>
              <button
                onClick={() => confirmAndTrigger('/api/backups-logs/trigger-semester-end/', 'Trigger Semester End Automation', 'This will manually execute the semester-end config archiving process. Proceed?')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                <Settings className="w-4 h-4" /> Trigger Automation manually
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Academic Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Semester</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Archived On</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {archivesLoading ? (
                    <tr><td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">Loading archives…</td></tr>
                  ) : archives.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">No semester archives found for Feedback.</td></tr>
                  ) : archives.map(exp => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{exp.academic_year || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{exp.semester_label || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(exp.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {exp.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" /> Success</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{exp.status}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button 
                          onClick={() => {
                            fetchWithAuth('/api/backups-logs/config-import-preview/', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ export_id: exp.id, target_section_id: 'feedback' })
                            })
                              .then(r => r.json())
                              .then(d => {
                                setDiffState({
                                  isOpen: true,
                                  title: `Preview Archive Import (${exp.academic_year} ${exp.semester_label})`,
                                  diff: d.diff,
                                  onConfirm: () => {
                                    setDiffState(prev => ({...prev, isOpen: false}));
                                    confirmAndTrigger(
                                      `/api/backups-logs/config-import/${exp.id}/`, 
                                      'Import Feedback Config', 
                                      'CONFIRM IMPORT?\n\nThis will overwrite current data. A safety backup will be taken first.', 
                                      {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ target_section_id: 'feedback' })
                                      },
                                      true
                                    );
                                  }
                                });
                              })
                              .catch(err => alert('Preview failed: ' + err));
                          }}
                          className="text-indigo-600 hover:text-indigo-900 font-medium"
                        >
                          Preview Diff
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      
      {/* Reusable Modals */}
      <ConfirmationDialog {...confirmState} onCancel={() => setConfirmState(prev => ({...prev, isOpen: false}))} />
      
      {diffState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <FileJson className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-bold text-gray-900">{diffState.title}</h3>
            </div>
            <div className="p-6 overflow-hidden flex flex-col min-h-0">
              <DiffPreview diff={diffState.diff} />
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100 mt-auto">
              <button onClick={() => setDiffState(prev => ({...prev, isOpen: false}))} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              {diffState.onConfirm && (
                <button onClick={diffState.onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  Confirm Import
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Archive className="w-8 h-8 text-blue-600" />
          Backups & Logs
        </h1>
        <p className="text-gray-500 mt-2">Manage system backups, imports, and view activity logs.</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200 mb-6 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('modules')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === 'modules' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
        >
          <div className="flex items-center gap-2"><Server className="w-4 h-4" /> Browse by Module</div>
        </button>
        <button
          onClick={() => setActiveTab('archives')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === 'archives' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
        >
          <div className="flex items-center gap-2"><Archive className="w-4 h-4" /> Browse by Semester/Year</div>
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === 'activity' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
        >
          <div className="flex items-center gap-2"><Activity className="w-4 h-4" /> Activity Logs</div>
        </button>
      </div>

      {renderTabContent()}
    </div>
  );
}
