/**
 * Course List Page - Faculty View (Academic 2.1)
 * Shows assigned courses with mark entry status and historical academic year retention.
 * Includes top slidebars for Current Semester (default) and past 5 academic years.
 * Allows viewing and downloading preserved historical mappings.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  Filter,
  Search,
  Calendar,
  History,
  Download,
  ChevronLeft,
  Sparkles,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchMyTeachingAssignments, TeachingAssignmentItem } from '../../../services/obe';
import { fetchAcademicYears, AcademicYearRow } from '../../../services/academics';
import fetchWithAuth from '../../../services/fetchAuth';

interface Course {
  id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  section: string;
  department: string;
  semester: number | null;
  academic_year: string;
  academic_year_id?: number | null;
  academic_year_parity?: string | null;
  is_elective: boolean;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  qp_type?: string | null;
}

export default function CourseListPage() {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Academic years state
  const [academicYears, setAcademicYears] = useState<AcademicYearRow[]>([]);
  const [selectedAyId, setSelectedAyId] = useState<number | null>(null);
  const [loadingYears, setLoadingYears] = useState(true);

  // Courses state
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Load academic years on mount
  useEffect(() => {
    loadAcademicYears();
  }, []);

  // When selectedAyId changes, load courses for that academic year
  useEffect(() => {
    if (selectedAyId !== null) {
      loadCourses(selectedAyId);
    }
  }, [selectedAyId]);

  const loadAcademicYears = async () => {
    try {
      setLoadingYears(true);
      const years = await fetchAcademicYears();
      setAcademicYears(years);

      // Default to the currently active academic year, or the first in the list
      const activeYear = years.find((ay) => ay.is_active) || years[0];
      if (activeYear) {
        setSelectedAyId(activeYear.id);
      }
    } catch (err: any) {
      console.error('Failed to load academic years:', err);
      // Fallback: load courses without specific academic year
      loadCourses();
    } finally {
      setLoadingYears(false);
    }
  };

  const loadCourses = async (ayId?: number) => {
    try {
      setLoading(true);
      setError(null);

      const targetAyId = ayId ?? selectedAyId ?? undefined;

      // 1. Fetch teaching assignments for the selected academic year
      const teachingAssignments = await fetchMyTeachingAssignments(targetAyId);

      // 2. Fetch real mark-entry statuses from academic-v2
      let statusMap: Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'> = {};
      try {
        const query = targetAyId ? `?academic_year_id=${targetAyId}` : '';
        const statusResp = await fetchWithAuth(`/api/academic-v2/faculty/courses/${query}`);
        if (statusResp.ok) {
          statusMap = await statusResp.json();
        }
      } catch (_) {
        // Non-fatal: fall back to NOT_STARTED
      }

      // 3. Map teaching assignments to Course format
      const mappedCourses: Course[] = teachingAssignments.map((ta: TeachingAssignmentItem) => ({
        id: ta.id,
        course_code: ta.subject_code || '',
        course_name: ta.subject_name || ta.elective_subject_name || '',
        class_type: ta.class_type || 'THEORY',
        section: ta.section_name || '',
        department: ta.department?.short_name || ta.department?.name || '',
        semester: ta.semester,
        academic_year: ta.academic_year || '',
        academic_year_id: ta.academic_year_id,
        academic_year_parity: ta.academic_year_parity,
        is_elective: !!ta.elective_subject_id,
        status: statusMap[String(ta.id)] ?? 'NOT_STARTED',
        qp_type: (ta as any)?.question_paper_type || (ta as any)?.qp_type || null,
      }));

      setCourses(mappedCourses);
    } catch (err: any) {
      console.error('Failed to load courses:', err);
      setError(err?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  // Sort academic years dynamically from DB: active first, then year name descending, parity descending
  const sortedAcademicYears = React.useMemo(() => {
    return [...academicYears].sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      if (a.name !== b.name) return b.name.localeCompare(a.name);
      return (b.parity || '').localeCompare(a.parity || '');
    });
  }, [academicYears]);

  // Active academic year according to database is_active flag
  const activeYear = academicYears.find((ay) => ay.is_active) || sortedAcademicYears[0];
  const selectedYear = academicYears.find((ay) => ay.id === selectedAyId) || activeYear;
  const isViewingHistorical = selectedYear && activeYear && selectedYear.id !== activeYear.id;

  // Slidebar scroll handlers
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -260, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 260, behavior: 'smooth' });
    }
  };

  // Export Course Mappings as Excel
  const handleExportExcel = () => {
    try {
      setExporting(true);
      const rows = filteredCourses.map((c, idx) => ({
        'S.No': idx + 1,
        'Academic Year': c.academic_year || selectedYear?.name || '',
        'Parity': selectedYear?.parity || '',
        'Course Code': c.course_code,
        'Course Name': c.course_name,
        'Class Type': c.class_type,
        'QP Type': c.qp_type || 'N/A',
        'Section': c.section || 'All',
        'Department': c.department || 'N/A',
        'Semester': c.semester ? `Semester ${c.semester}` : 'N/A',
        'Type': c.is_elective ? 'Elective' : 'Core',
        'Mark Entry Status': c.status.replace('_', ' '),
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Course Mappings');

      // Generate filename
      const aySafe = (selectedYear?.name || 'AY').replace(/[\/\\]/g, '-');
      const paritySafe = selectedYear?.parity || 'ALL';
      const filename = `Faculty_Courses_${aySafe}_${paritySafe}.xlsx`;

      XLSX.writeFile(workbook, filename);
    } catch (err: any) {
      console.error('Failed to export courses:', err);
      alert('Failed to export: ' + (err?.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  // Filtered courses based on status and search query
  const filteredCourses = courses.filter((course) => {
    if (statusFilter !== 'ALL' && course.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        course.course_code.toLowerCase().includes(query) ||
        course.course_name.toLowerCase().includes(query) ||
        course.section.toLowerCase().includes(query) ||
        course.department.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Completed
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-amber-600" /> In Progress
          </span>
        );
      case 'NOT_STARTED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" /> Not Started
          </span>
        );
      default:
        return null;
    }
  };

  const stats = {
    total: courses.length,
    completed: courses.filter((c) => c.status === 'COMPLETED').length,
    inProgress: courses.filter((c) => c.status === 'IN_PROGRESS').length,
    notStarted: courses.filter((c) => c.status === 'NOT_STARTED').length,
  };

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">Faculty Course List</h1>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-full text-xs font-semibold">
              Academic 2.1
            </span>
          </div>
          <p className="text-slate-500 mt-1 text-sm">
            Manage marks, assessments, and historical course mappings across academic years
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            disabled={filteredCourses.length === 0 || exporting}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm transition-all active:scale-95"
            title="Download course mappings as Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{exporting ? 'Exporting...' : 'Export Mappings'}</span>
          </button>

          <button
            onClick={() => loadCourses(selectedAyId ?? undefined)}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
            title="Refresh Courses"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TOP SLIDEBAR: Thin Linear Horizontal Bar (Current Semester Default + Past Years)
         ───────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Academic Years &amp; Semesters
            </span>
            {selectedYear && (
              <span className="text-[11px] font-medium text-slate-400">
                • Active: <strong className="text-slate-700">{selectedYear.name} ({selectedYear.parity || 'All'})</strong>
                {selectedYear.is_active && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                    LIVE CURRENT
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Slide navigation controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={scrollLeft}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              title="Scroll left"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={scrollRight}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              title="Scroll right"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Thin Linear Horizontal Bar */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-1 shadow-xs">
          <div
            ref={scrollContainerRef}
            className="flex items-center gap-1.5 overflow-x-auto scroll-smooth scrollbar-none py-0.5 px-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {loadingYears ? (
              <div className="py-1 px-3 flex items-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>Loading academic years...</span>
              </div>
            ) : (
              <>
                {sortedAcademicYears.map((ay) => {
                  const isSelected = selectedAyId === ay.id;
                  return (
                    <button
                      key={ay.id}
                      onClick={() => setSelectedAyId(ay.id)}
                      className={`flex-shrink-0 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500'
                          : ay.is_active
                          ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/90 border border-emerald-200/80 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      {ay.is_active ? (
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSelected ? 'bg-emerald-300' : 'bg-emerald-500'
                          } animate-pulse`}
                        />
                      ) : (
                        <Calendar
                          className={`w-3.5 h-3.5 ${
                            isSelected ? 'text-indigo-200' : 'text-slate-400'
                          }`}
                        />
                      )}
                      <span>{ay.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          isSelected
                            ? 'bg-indigo-700/80 text-indigo-100'
                            : ay.is_active
                            ? 'bg-emerald-200/70 text-emerald-900'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {ay.parity}
                      </span>
                      {ay.is_active && (
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold uppercase tracking-wide ${
                            isSelected
                              ? 'bg-emerald-400/30 text-emerald-200 border border-emerald-300/30'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300/50'
                          }`}
                        >
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}

                {sortedAcademicYears.length === 0 && !loadingYears && (
                  <div className="flex items-center px-3 text-xs text-slate-400 italic">
                    No academic years found in the database.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Historical Archive Notice (if viewing past year) */}
      {isViewingHistorical && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl flex-shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-950">
                Viewing Historical Course Mappings: Academic Year {selectedYear?.name} ({selectedYear?.parity})
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                These course and section mappings are preserved historical records. Mappings or edits in the current year will not modify or overwrite this archived data.
              </p>
            </div>
          </div>

          <button
            onClick={handleExportExcel}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Download This Archive
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Courses</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
          <div className="text-xs text-slate-500 mt-1">{selectedYear?.name || 'Selected Period'}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.completed}</div>
          <div className="text-xs text-slate-500 mt-1">100% Mark Entry Done</div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">In Progress</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{stats.inProgress}</div>
          <div className="text-xs text-slate-500 mt-1">Ongoing Assessments</div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Not Started</div>
          <div className="text-2xl font-bold text-slate-600 mt-1">{stats.notStarted}</div>
          <div className="text-xs text-slate-500 mt-1">Pending Entry</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Status:</span>
            {['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  statusFilter === status
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative md:w-80">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search course code, name, section..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Course Cards Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[260px] bg-white rounded-2xl border border-slate-200 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
          <p className="text-sm">Loading course assignments...</p>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-base">
            {courses.length === 0
              ? `No courses mapped for ${selectedYear?.name || 'this period'}`
              : 'No courses match your filter'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {courses.length === 0
              ? 'No teaching assignments were found for your faculty account in this academic year.'
              : 'Try modifying your search or status filter to view available courses.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filteredCourses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => navigate(`/academic-v2/course/${course.id}`)}
            >
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors flex-shrink-0">
                      <BookOpen className="w-6 h-6" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition-colors">
                          {course.course_code}
                        </h3>
                        {course.is_elective && (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/70 text-xs font-semibold rounded-md">
                            Elective
                          </span>
                        )}
                        {course.class_type && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium rounded-md">
                            {course.class_type}
                          </span>
                        )}
                        {course.qp_type && (
                          <span className="px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200/70 text-xs font-semibold rounded-md">
                            {course.qp_type}
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-medium text-slate-700 leading-snug">
                        {course.course_name}
                      </p>

                      <div className="flex items-center gap-2 text-xs text-slate-500 pt-0.5 flex-wrap">
                        {course.section && (
                          <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            Sec: {course.section}
                          </span>
                        )}
                        {course.department && (
                          <span>Dept: <strong>{course.department}</strong></span>
                        )}
                        {course.semester && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span>Semester {course.semester}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right flex flex-col items-end gap-1.5">
                      {getStatusBadge(course.status)}
                      {course.academic_year && (
                        <span className="text-xs text-slate-400 font-medium">
                          {course.academic_year} {course.academic_year_parity ? `(${course.academic_year_parity})` : ''}
                        </span>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
