import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Users, BookOpen, AlertCircle, Loader, X, Plus } from 'lucide-react';
import { SearchableDropdown } from '../../../components/ui/SearchableDropdown';
import fetchWithAuth from '../../../services/fetchAuth';

interface Props {
  facultyOptions: { label: string; value: string }[];
}

interface SectionData {
  id: number;
  name: string;
  label: string;
  year: number | null;
  semester: number | null;
  department_short_name: string | null;
}

export default function TeachingAssignSection({ facultyOptions }: Props) {
  const [expandedYear, setExpandedYear] = useState<string | null>(null);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [sectionsData, setSectionsData] = useState<SectionData[]>([]);
  const [sectionCurriculum, setSectionCurriculum] = useState<Record<string, any[]>>({});
  const [sectionCurriculumLoading, setSectionCurriculumLoading] = useState<Record<string, boolean>>({});
  const [sectionCurriculumError, setSectionCurriculumError] = useState<Record<string, string>>({});
  const [classAdvisorSelection, setClassAdvisorSelection] = useState<Record<string, string>>({});
  const [subjectFacultySelection, setSubjectFacultySelection] = useState<Record<string, Record<string, string>>>({});
  const [savingState, setSavingState] = useState<Record<string, boolean>>({});
  const [saveMessage, setSaveMessage] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await fetchWithAuth('/api/academics/sections/?page_size=0');
        if (res.ok) {
          const data = await res.json();
          const raw = data.results || data;
          const mappedData = raw.map((r: any) => {
            let batchStr = r.batch_name || r.batch || '';
            if (typeof batchStr === 'object' && batchStr !== null) {
              batchStr = batchStr.name || '';
            }
            const batchName = String(batchStr);
            let yearNum = null;
            if (r.semester !== undefined && r.semester !== null) {
              const sem = Number(r.semester);
              if (sem === 1 || sem === 2) yearNum = 1;
              else if (sem === 3 || sem === 4) yearNum = 2;
              else if (sem === 5 || sem === 6) yearNum = 3;
              else if (sem >= 7) yearNum = 4;
            }
            if (yearNum === null && r.year !== undefined && r.year !== null) {
              yearNum = Number(r.year);
            }
            if (yearNum === null) {
              if (batchName.includes('2025')) yearNum = 1;
              else if (batchName.includes('2024')) yearNum = 2;
              else if (batchName.includes('2023')) yearNum = 3;
              else if (batchName.includes('2022')) yearNum = 4;
              else if (batchName.includes('2021')) yearNum = 4;
            }
            
            return {
              id: r.section_id || r.id,
              name: r.section_name || r.name,
              label: r.label || r.name,
              year: yearNum,
              semester: r.semester,
              department_short_name: r.department_short_name || r.department_code || (r.department && r.department.code) || ''
            };
          });
          setSectionsData(mappedData);
        }
      } catch (err) {
        console.error('Failed to fetch sections:', err);
      }
    };
    fetchSections();
  }, []);

  const deptMapping: Record<string, string[]> = {
    'IT': ['information technology', 'it', '205'],
    'AI&DS': ['artificial intelligence & data science', 'artificial intelligence and data science', 'ai&ds', 'aids', '243'],
    'AIML': ['artificial intelligence & machine learning', 'artificial intelligence and machine learning', 'aiml', 'ai&ml', '148'],
    'CSE': ['computer science', 'cse', 'cs', '104'],
    'ECE': ['electronics and communication', 'ece', '106'],
    'EEE': ['electrical and electronics', 'eee', '105'],
    'MECH': ['mechanical', 'mech', 'me', '114'],
    'CIVIL': ['civil', 'ce', '103'],
    'S&H': ['science and humanities', 's&h', 'sh']
  };

  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  
  const departments = [
    { name: 'IT' },
    { name: 'AI&DS' },
    { name: 'AIML' },
    { name: 'CSE' },
    { name: 'ECE' },
    { name: 'EEE' },
    { name: 'MECH' },
    { name: 'CIVIL' },
    { name: 'S&H' }
  ];

  const getDynamicDepartments = (yearLabel: string) => {
    let yearNum = 0;
    if (yearLabel === '1st Year') { yearNum = 1; }
    else if (yearLabel === '2nd Year') { yearNum = 2; }
    else if (yearLabel === '3rd Year') { yearNum = 3; }
    else if (yearLabel === '4th Year') { yearNum = 4; }
    
    // Fallback to year filter since production API might not have semester yet
    const filtered = sectionsData.filter(s => Number(s.year) === yearNum);
    
    let activeDepartments = departments;
    if (yearNum === 1) {
      activeDepartments = departments.filter(d => d.name === 'S&H');
    } else {
      activeDepartments = departments.filter(d => d.name !== 'S&H');
    }
    
    return activeDepartments.map(dept => {
      const allowedNames = deptMapping[dept.name] || [dept.name.toLowerCase()];
      
      let deptSections;
      if (yearNum === 1 && dept.name === 'S&H') {
        deptSections = filtered.filter(s => {
          const dName = (s.department_short_name || '').toLowerCase().trim();
          if (!dName) return true;
          const shNames = deptMapping['S&H'] || [];
          return shNames.some(allowed => dName.includes(allowed));
        }).map(s => ({ id: s.id, name: s.name }));
      } else {
        deptSections = filtered.filter(s => {
          const dName = (s.department_short_name || '').toLowerCase().trim();
          if (!dName) return false;
          
          return allowedNames.some(allowed => {
            if (dName === allowed) return true;
            
            if (allowed.length <= 3) {
              const parts = dName.split(/[\s\-_]+/);
              return parts.includes(allowed);
            }
            
            return dName.includes(allowed);
          });
        }).map(s => ({ id: s.id, name: s.name }));
      }
      
      const uniqueMap = new Map();
      deptSections.forEach(s => {
        if (s && s.name && !uniqueMap.has(s.name)) {
          uniqueMap.set(s.name, s);
        }
      });
      const uniqueSections = Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      
      return {
        name: dept.name,
        sections: uniqueSections
      };
    });
  };

  const toggleYear = (year: string) => {
    if (expandedYear === year) {
      setExpandedYear(null);
    } else {
      setExpandedYear(year);
      setExpandedDept(null);
      setExpandedSection(null);
    }
  };

  const toggleDept = (dept: string) => {
    if (expandedDept === dept) {
      setExpandedDept(null);
    } else {
      setExpandedDept(dept);
      setExpandedSection(null);
    }
  };

  const toggleSection = async (sectionKey: string, sectionId: number) => {
    if (expandedSection === sectionKey) {
      setExpandedSection(null);
    } else {
      setExpandedSection(sectionKey);
      
      // Load curriculum if not already loaded
      if (!sectionCurriculum[sectionKey] && sectionId) {
        setSectionCurriculumLoading(prev => ({ ...prev, [sectionKey]: true }));
        setSectionCurriculumError(prev => ({ ...prev, [sectionKey]: '' }));
        
        try {
          const res = await fetchWithAuth(`/api/timetable/curriculum-for-section/?section_id=${sectionId}`);
          if (res.ok) {
            const data = await res.json();
            setSectionCurriculum(prev => ({ ...prev, [sectionKey]: data.results || data }));
            setSectionCurriculumError(prev => ({ ...prev, [sectionKey]: '' }));
          } else {
            const errorMsg = `Failed to load curriculum (HTTP ${res.status})`;
            setSectionCurriculumError(prev => ({ ...prev, [sectionKey]: errorMsg }));
            console.error(errorMsg);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error loading curriculum';
          setSectionCurriculumError(prev => ({ ...prev, [sectionKey]: errorMsg }));
          console.error('Failed to fetch curriculum:', err);
        } finally {
          setSectionCurriculumLoading(prev => ({ ...prev, [sectionKey]: false }));
        }
      }
      
      // Refresh assignments and advisors to show latest data
      try {
        const [assignRes, advisorRes] = await Promise.all([
          fetchWithAuth('/api/academics/teaching-assignments/?page_size=0'),
          fetchWithAuth('/api/academics/section-advisors/?page_size=0')
        ]);
        if (assignRes.ok) {
          const data = await assignRes.json();
          setAssignments(data.results || data);
        }
        if (advisorRes.ok) {
          const data = await advisorRes.json();
          setAdvisors(data.results || data);
        }
      } catch (err) {
        console.error('Failed to refresh data:', err);
      }
    }
  };

  const [assignments, setAssignments] = useState<any[]>([]);
  const [advisors, setAdvisors] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [assignRes, advisorRes] = await Promise.all([
          fetchWithAuth('/api/academics/teaching-assignments/?page_size=0'),
          fetchWithAuth('/api/academics/section-advisors/?page_size=0')
        ]);
        if (assignRes.ok) {
          const data = await assignRes.json();
          const assignmentsData = data.results || data;
          console.log('📥 Loaded assignments on page load:', assignmentsData.length, 'total');
          // Show sample assignment with staff details
          if (assignmentsData.length > 0) {
            console.log('📋 Sample assignment structure:', assignmentsData[0]);
            const withStaffDetails = assignmentsData.filter((a: any) => a.staff_details);
            console.log('✓ Assignments with staff_details:', withStaffDetails.length, '/', assignmentsData.length);
            // Check for GEA1122 (subject id 1321)
            const gea1122 = assignmentsData.find((a: any) => {
              const isCurriculumMatch = a.curriculum_row == 1321 || (a.curriculum_row_details && a.curriculum_row_details.id == 1321);
              const isSubjectMatch = a.subject && (a.subject.includes('1122') || a.subject.includes('Tamils'));
              return isCurriculumMatch || isSubjectMatch;
            });
            if (gea1122) {
              console.log('🔍 Found GEA1122 assignment:', gea1122);
            } else {
              console.log('❌ GEA1122 assignment NOT found in loaded data');
            }
          }
          setAssignments(assignmentsData);
        }
        if (advisorRes.ok) {
          const data = await advisorRes.json();
          setAdvisors(data.results || data);
        }
      } catch (err) {
        console.error('Failed to fetch assignments:', err);
      }
    };
    fetchData();
  }, []);

  const [autoSavingSubjects, setAutoSavingSubjects] = useState<Record<string, Set<string>>>({});
  const [autoSaveMessages, setAutoSaveMessages] = useState<Record<string, Record<string, { type: 'success' | 'error'; text: string }>>>({});
  const [temporarySelection, setTemporarySelection] = useState<Record<string, string>>({});
  const [additionalDropdowns, setAdditionalDropdowns] = useState<Record<string, number>>({});

  const renderSubjectMapping = (sectionKey: string, sectionId: number) => {
    const subjects = sectionCurriculum[sectionKey] || [];
    const isLoading = sectionCurriculumLoading[sectionKey] || false;
    const error = sectionCurriculumError[sectionKey] || '';
    const isSaving = savingState[sectionKey] || false;
    const message = saveMessage[sectionKey];
    const subjectAutoSavingSet = autoSavingSubjects[sectionKey] || new Set();
    const subjectAutoMessages = autoSaveMessages[sectionKey] || {};
    
    // Show loading state
    if (isLoading) {
      return (
        <div className="p-8 bg-gray-50 rounded-lg text-center">
          <Loader className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600 font-medium">Loading curriculum...</p>
        </div>
      );
    }
    
    // Show error state
    if (error) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-red-800 font-medium">Failed to load curriculum</p>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
        </div>
      );
    }
    
    // Show empty state
    if (!isLoading && subjects.length === 0) {
      return (
        <div className="p-8 bg-gray-50 rounded-lg text-center">
          <BookOpen className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 font-medium">No subjects configured for this section</p>
          <p className="text-gray-500 text-sm mt-1">Check if curriculum has been assigned to this section</p>
        </div>
      );
    }
    
    const handleClassAdvisorChange = (value: string) => {
      setClassAdvisorSelection(prev => ({ ...prev, [sectionKey]: value }));
    };

    const handleSubjectFacultyChange = async (subjectId: string, value: string, assignmentId?: number) => {
      // Show saving state for this specific subject
      const key = `${sectionKey}-${subjectId}`;
      setAutoSavingSubjects(prev => ({
        ...prev,
        [sectionKey]: new Set([...(prev[sectionKey] || []), subjectId])
      }));

      // Track the selected faculty temporarily
      if (value) {
        setTemporarySelection(prev => ({
          ...prev,
          [subjectId]: value
        }));
      }

      try {
        const isNewAssignment = subjectId.startsWith('new-');
        const isAddAssignment = subjectId.startsWith('add-');
        let actualSubjectId = subjectId;
        if (isNewAssignment) actualSubjectId = subjectId.replace('new-', '');
        if (isAddAssignment) actualSubjectId = subjectId.replace(/add-([^-]+)-.*/, '$1');
        
        // Get the subject object from curriculum to verify it exists
        const subjectObj = subjects.find(s => s.id == actualSubjectId);
        if (!subjectObj) {
          throw new Error(`Subject not found in curriculum (ID: ${actualSubjectId})`);
        }

        let existingAssignment: any = null;
        if (assignmentId) {
          existingAssignment = assignments.find(a => a.id === assignmentId);
        } else if (!isNewAssignment && !isAddAssignment) {
          existingAssignment = assignments.find(a => {
            const isCourseCodeMatch = a.curriculum_row_details?.course_code && subjectObj.course_code && a.curriculum_row_details.course_code === subjectObj.course_code;
            const curriculumMatch = (
              a.curriculum_row == Number(actualSubjectId) ||
              (a.curriculum_row_details && a.curriculum_row_details.id == Number(actualSubjectId)) ||
              isCourseCodeMatch
            );
            const sectionMatch = (
              a.section == sectionId || 
              (a.section_details && a.section_details.id == sectionId)
            );
            return curriculumMatch && sectionMatch;
          });
        }

        console.log(`🔍 Checking for existing assignment: subject=${actualSubjectId}, section=${sectionId}, found=${existingAssignment ? `id:${existingAssignment.id}, is_active:${existingAssignment.is_active}` : 'none'}`);

        // Handle deletion (empty value or DELETE marker)
        if (!value || value === 'DELETE') {
          if (existingAssignment) {
            const deleteRes = await fetchWithAuth(
              `/api/academics/teaching-assignments/${existingAssignment.id}/`,
              { method: 'DELETE' }
            );
            if (deleteRes.ok) {
              setAutoSaveMessages(prev => ({
                ...prev,
                [sectionKey]: {
                  ...(prev[sectionKey] || {}),
                  [subjectId]: { type: 'success', text: '✓ Removed' }
                }
              }));
              // Refresh data
              await new Promise(resolve => setTimeout(resolve, 1000));
              const [assignRes] = await Promise.all([
                fetchWithAuth('/api/academics/teaching-assignments/?page_size=0')
              ]);
              if (assignRes.ok) {
                setAssignments((await assignRes.json()).results || []);
              }
            } else {
              const errText = await deleteRes.text().catch(() => 'Unknown error');
              throw new Error(`Delete failed: ${errText}`);
            }
          }
        } else {
          // Create new assignment OR update existing
          const payload = {
            section_id: sectionId,
            curriculum_row_id: Number(actualSubjectId),
            staff_id: Number(value),
            is_active: true
          };
          
          console.log('📤 Sending assignment payload:', {
            ...payload,
            subjectObj: subjectObj,
            section: sectionsData.find(s => s.id === sectionId),
            isUpdate: !!existingAssignment,
            existingAssignmentId: existingAssignment?.id
          });

          // If assignment already exists, UPDATE it; otherwise CREATE new
          let assignmentRes;
          if (existingAssignment) {
            console.log(`📝 Updating existing assignment ${existingAssignment.id} with new staff_id ${value}`);
            assignmentRes = await fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignment.id}/`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                staff_id: Number(value),
                is_active: true
              })
            });
          } else {
            console.log(`✨ Creating new assignment for subject ${actualSubjectId}`);
            assignmentRes = await fetchWithAuth('/api/academics/teaching-assignments/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }

          if (!assignmentRes.ok) {
            let errDetails = 'Unknown error';
            try {
              const errData = await assignmentRes.json();
              console.error('📋 Full Error Response:', errData);
              
              // Try to extract meaningful error message
              if (typeof errData === 'object') {
                if (errData.detail) errDetails = errData.detail;
                else if (errData.non_field_errors) errDetails = errData.non_field_errors[0] || 'Validation error';
                else if (errData.section_id) errDetails = `Section error: ${Array.isArray(errData.section_id) ? errData.section_id[0] : errData.section_id}`;
                else if (errData.curriculum_row_id) errDetails = `Curriculum error: ${Array.isArray(errData.curriculum_row_id) ? errData.curriculum_row_id[0] : errData.curriculum_row_id}`;
                else if (errData.curriculum_row) errDetails = `Curriculum error: ${Array.isArray(errData.curriculum_row) ? errData.curriculum_row[0] : errData.curriculum_row}`;
                else if (errData.staff_id) errDetails = `Staff error: ${Array.isArray(errData.staff_id) ? errData.staff_id[0] : errData.staff_id}`;
                else {
                  const keys = Object.keys(errData);
                  if (keys.length > 0) {
                    const firstKey = keys[0];
                    const firstVal = errData[firstKey];
                    errDetails = Array.isArray(firstVal) ? firstVal[0] : firstVal;
                  }
                }
              }
            } catch (e) {
              errDetails = `HTTP 400: Bad Request`;
            }
            throw new Error(errDetails);
          }

          const result = await assignmentRes.json();
          console.log('✅ Assignment saved successfully:', result);
          console.log('📊 Assignment ID:', result.id, 'Section:', result.section, 'Curriculum:', result.curriculum_row, 'Staff:', result.staff, 'is_active:', result.is_active);

          setAutoSaveMessages(prev => ({
            ...prev,
            [sectionKey]: {
              ...(prev[sectionKey] || {}),
              [subjectId]: { type: 'success', text: '✓ Saved' }
            }
          }));

          // Refresh data after save
          console.log('⏳ Waiting 1s before refresh...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            const assignRes = await fetchWithAuth('/api/academics/teaching-assignments/?page_size=0');
            if (assignRes.ok) {
              const data = await assignRes.json();
              const refreshedAssignments = data.results || data || [];
              console.log('✅ Refreshed assignments after save:', refreshedAssignments.length, 'total');
              // Check if our new assignment is in the list
              const newAssignmentInList = refreshedAssignments.find((a: any) => a.id === result.id);
              if (newAssignmentInList) {
                console.log('✓ New assignment found in refreshed list!', newAssignmentInList);
              } else {
                console.warn('⚠️ New assignment NOT found in refreshed list!');
              }
              setAssignments(refreshedAssignments);
            } else {
              console.warn('Failed to refresh assignments:', assignRes.status);
            }
          } catch (refreshErr) {
            console.warn('Error refreshing assignments:', refreshErr);
          }
        }
      } catch (err: any) {
        console.error('❌ Error saving subject faculty:', err);
        const errorMsg = err.message || 'Unknown error';
        setAutoSaveMessages(prev => ({
          ...prev,
          [sectionKey]: {
            ...(prev[sectionKey] || {}),
            [subjectId]: { type: 'error', text: `✗ ${errorMsg}` }
          }
        }));
      } finally {
        // Clear saving state
        setAutoSavingSubjects(prev => {
          const newSet = new Set(prev[sectionKey] || []);
          newSet.delete(subjectId);
          return { ...prev, [sectionKey]: newSet };
        });

        // Clear message after 3 seconds and temp selection after refresh
        setTimeout(() => {
          setAutoSaveMessages(prev => {
            const newMsgs = { ...(prev[sectionKey] || {}) };
            delete newMsgs[subjectId];
            return { ...prev, [sectionKey]: newMsgs };
          });
          // Clear temporary selection once confirmed
          setTemporarySelection(prev => {
            const newSelections = { ...prev };
            delete newSelections[subjectId];
            return newSelections;
          });
        }, 3000);
      }
    };

    const handleSave = async () => {
      console.log('🔵 SAVE CLICKED - Section:', sectionKey, 'Advisor:', classAdvisorSelection[sectionKey], 'Subjects:', subjectFacultySelection[sectionKey]);
      
      setSavingState(prev => ({ ...prev, [sectionKey]: true }));
      setSaveMessage(prev => ({ ...prev, [sectionKey]: undefined }));

      try {
        // Save class advisor
        const advisorValue = classAdvisorSelection[sectionKey];
        if (advisorValue) {
          const advisorRes = await fetchWithAuth('/api/academics/section-advisors/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              section_id: sectionId,
              advisor_id: Number(advisorValue),
              is_active: true
            })
          });
          if (!advisorRes.ok) {
            throw new Error('Failed to save class advisor');
          }
        }

        // Save subject-faculty mappings
        const subjectSelections = subjectFacultySelection[sectionKey] || {};
        const failedMappings: string[] = [];
        let successCount = 0;
        let deletedCount = 0;

        for (const [subjectIdRaw, newStaffId] of Object.entries(subjectSelections)) {
          // Detect if this is a new assignment or update
          const isNewAssignment = subjectIdRaw.startsWith('new-');
          const subjectId = isNewAssignment 
            ? subjectIdRaw.replace('new-', '') 
            : subjectIdRaw;

          // Find existing assignment if updating
          const existingAssignment = !isNewAssignment 
            ? assignments.find(a => 
                a.section == sectionId && a.curriculum_row == Number(subjectId)
              )
            : null;

          // Handle deletion (empty value or DELETE marker)
          if (!newStaffId || newStaffId === 'DELETE') {
            if (existingAssignment) {
              try {
                const deleteRes = await fetchWithAuth(
                  `/api/academics/teaching-assignments/${existingAssignment.id}/`,
                  { method: 'DELETE' }
                );
                if (deleteRes.ok) {
                  deletedCount++;
                } else {
                  console.warn('Failed to delete assignment');
                  const curriculum = subjects.find(s => s.id === Number(subjectId));
                  failedMappings.push(curriculum?.course_name || `Subject ${subjectId}`);
                }
              } catch (err) {
                console.warn('Error deleting assignment:', err);
                const curriculum = subjects.find(s => s.id === Number(subjectId));
                failedMappings.push(curriculum?.course_name || `Subject ${subjectId}`);
              }
            }
            continue;
          }

          // If updating existing assignment, first delete the old one
          if (existingAssignment) {
            try {
              const deleteRes = await fetchWithAuth(
                `/api/academics/teaching-assignments/${existingAssignment.id}/`,
                { method: 'DELETE' }
              );
              if (!deleteRes.ok) {
                console.warn('Failed to delete old assignment, continuing...');
              }
            } catch (err) {
              console.warn('Error deleting old assignment:', err);
            }
          }

          // Create new assignment
          const assignmentRes = await fetchWithAuth('/api/academics/teaching-assignments/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              section_id: sectionId,
              curriculum_row_id: Number(subjectId),
              staff_id: Number(newStaffId),
              is_active: true
            })
          });

          if (!assignmentRes.ok) {
            const curriculum = subjects.find(s => s.id === Number(subjectId));
            failedMappings.push(curriculum?.course_name || `Subject ${subjectId}`);
          } else {
            successCount++;
          }
        }

        if (failedMappings.length > 0) {
          console.log('DEBUG: Save completed with failures:', failedMappings);
          setSaveMessage(prev => ({
            ...prev,
            [sectionKey]: {
              type: 'error',
              text: `Saved ${successCount}, Deleted ${deletedCount}. Failed: ${failedMappings.join(', ')}`
            }
          }));
        } else if (successCount > 0 || deletedCount > 0) {
          console.log('DEBUG: Save completed successfully, successCount:', successCount, 'deletedCount:', deletedCount);
          setSaveMessage(prev => ({
            ...prev,
            [sectionKey]: {
              type: 'success',
              text: `✓ Saved ${successCount} assignments, Deleted ${deletedCount}! Changes persisted.`
            }
          }));
          // Reload assignments and advisors after successful save to persist the changes
          setTimeout(async () => {
            try {
              const [assignRes, advisorRes] = await Promise.all([
                fetchWithAuth('/api/academics/teaching-assignments/?page_size=0'),
                fetchWithAuth('/api/academics/section-advisors/?page_size=0')
              ]);
              if (assignRes.ok) {
                const data = await assignRes.json();
                setAssignments(data.results || data);
              }
              if (advisorRes.ok) {
                const data = await advisorRes.json();
                setAdvisors(data.results || data);
              }
            } catch (err) {
              console.error('Failed to reload data:', err);
            }
            // Clear selections to show saved data instead
            setClassAdvisorSelection(prev => {
              const newState = { ...prev };
              delete newState[sectionKey];
              return newState;
            });
            setSubjectFacultySelection(prev => {
              const newState = { ...prev };
              delete newState[sectionKey];
              return newState;
            });
          }, 1500);
        } else {
          setSaveMessage(prev => ({
            ...prev,
            [sectionKey]: {
              type: 'error',
              text: 'Please select at least one faculty member or delete an assignment'
            }
          }));
        }
      } catch (err) {
        console.error('Save error:', err);
        setSaveMessage(prev => ({
          ...prev,
          [sectionKey]: {
            type: 'error',
            text: 'Error saving assignments. Please try again.'
          }
        }));
      } finally {
        setSavingState(prev => ({ ...prev, [sectionKey]: false }));
      }
    };

    // Debug: Log all subjects and assignments for matching
    console.log(`📊 Section ${sectionKey} (ID: ${sectionId}) - Matching:`, {
      subjectsCount: subjects.length,
      assignmentsTotal: assignments.length,
      assignmentsForDebug: assignments.slice(0, 5).map(a => ({
        id: a.id,
        curriculum_row: a.curriculum_row,
        section: a.section,
        staff: a.staff,
        is_active: a.is_active
      }))
    });

    return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm mt-3">
      {/* Header with Save Button on Right */}
      <div className="mb-4 flex items-center justify-between border-b pb-4">
        <div className="flex-1">
          <h4 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-blue-600" />
            Class Advisor Assignment
          </h4>
          <div className="w-64">
            {(() => {
              // Find saved advisor for this section
              const savedAdvisor = advisors.find(a => a.section_id === sectionId && a.is_active);
              const savedAdvisorId = savedAdvisor?.advisor_id || "";
              
              return (
                <SearchableDropdown
                  label=""
                  placeholder="Select Class Advisor"
                  options={facultyOptions}
                  value={classAdvisorSelection[sectionKey] || String(savedAdvisorId) || ""}
                  onChange={handleClassAdvisorChange}
                />
              );
            })()}
          </div>
        </div>
        
        {/* Save Button and Message on Right */}
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 font-medium flex items-center gap-2 whitespace-nowrap"
          >
            {isSaving ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Saving...
              </>
            ) : (
              <>
                ✓ Save
              </>
            )}
          </button>
          {message && (
            <span className={`text-xs font-medium text-right ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>

      <h4 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
        <BookOpen className="w-5 h-5 text-green-600" />
        Subject Faculty Mapping
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-4 py-3">Subject Code</th>
              <th className="px-4 py-3">Subject Name</th>
              <th className="px-4 py-3 min-w-[250px]">Assigned Faculty</th>
            </tr>
          </thead>
          <tbody>
            {subjects.flatMap((sub, idx) => {
              // Find matching assignments
              const sectionNameStr = sectionKey.split('-')[1];
              const currentDeptName = sectionKey.split('-')[0];
              const allowedDeptNames = deptMapping[currentDeptName] || [currentDeptName.toLowerCase()];
              
              // Log current subject being processed
              console.log(`🔍 Processing subject ${idx}: ID=${sub.id}, Code=${sub.course_code}, Name=${sub.course_name}`);
              
              const matchingAssignments = assignments.filter(a => {
                // Only consider active assignments
                if (a.is_active === false) {
                  // Log assignments that are being filtered out
                  const wouldMatch = (a.curriculum_row == sub.id || (a.curriculum_row_details && a.curriculum_row_details.id == sub.id)) &&
                                     (a.section == sectionId || (a.section_details && a.section_details.id == sectionId));
                  if (wouldMatch) {
                    console.warn(`⚠️ Assignment ${a.id} is inactive (is_active=false) for subject ${sub.id}`);
                  }
                  return false;
                }
                
                // IMPROVED: Normalize all IDs to numbers for consistent comparison
                const aCurriculumRow = Number(a.curriculum_row || a.curriculum_row_details?.id || 0);
                const aSection = Number(a.section || a.section_details?.id || 0);
                const subIdNum = Number(sub.id || 0);
                const sectionIdNum = Number(sectionId || 0);
                
                const sectionIdMatch = aSection === sectionIdNum;
                const sectionNameMatch = a.section_name === sectionNameStr || (a.section_details && a.section_details.name === sectionNameStr);
                
                // IMPROVED: Match curriculum_row with multiple fallbacks
                const subjectMatch = aCurriculumRow === subIdNum || 
                                     (a.curriculum_row_details && Number(a.curriculum_row_details.id) === subIdNum) ||
                                     (a.curriculum_row_details?.course_code && sub.course_code && a.curriculum_row_details.course_code === sub.course_code);
                
                const electiveMatch = a.elective_subject_details && Number(a.elective_subject_details.parent_id) == subIdNum;
                
                const isMatch = subjectMatch ? (currentDeptName === 'S&H' ? (sectionIdMatch || sectionNameMatch) : sectionIdMatch) 
                             : electiveMatch ? (allowedDeptNames.some(d => {
                                   const elDept = (a.elective_subject_details.department_display || '').toLowerCase();
                                   const elDeptId = String(a.elective_subject_details.department_id || '');
                                   return elDept.includes(d) || elDeptId === d;
                                 }) ? true : sectionIdMatch) 
                             : false;
                
                // Enhanced logging with actual values
                if (subjectMatch || electiveMatch || isMatch) {
                  console.log(`📋 Subject ${sub.id} (${sub.course_code}) check against assignment ${a.id}:`, {
                    subjectMatch,
                    electiveMatch,
                    sectionIdMatch,
                    sectionNameMatch,
                    isMatch,
                    aCurriculumRow_normalized: aCurriculumRow,
                    subIdNum_normalized: subIdNum,
                    aSection_normalized: aSection,
                    sectionIdNum_normalized: sectionIdNum,
                    a_curriculum_row_raw: a.curriculum_row,
                    a_section_raw: a.section,
                    a_staff: a.staff,
                    a_staff_details: a.staff_details,
                    a_is_active: a.is_active
                  });
                }
                
                if (isMatch && (subjectMatch || electiveMatch)) {
                  console.log(`✓ ✅ MATCHED assignment ${a.id} for subject ${sub.id}:`, a);
                }
                
                return isMatch;
              });;
              
              console.log(`📊 Subject ${sub.id} found ${matchingAssignments.length} matching assignments`);

              const isMultiFacultyAllowed = currentDeptName === 'S&H' && Number(yearNum) === 1;
              const rows = [];
              
              if (matchingAssignments.length === 0) {
                const isSavingThisSubject = subjectAutoSavingSet.has(`new-${sub.id}`);
                const autoSaveMsg = subjectAutoMessages[`new-${sub.id}`];
                const tempSelectedValue = temporarySelection[`new-${sub.id}`];
                const tempSelectedFaculty = tempSelectedValue ? facultyOptions.find(opt => opt.value === tempSelectedValue)?.label : null;
                
                rows.push(
                  <tr key={idx} className={`border-b hover:bg-gray-50 transition-colors ${autoSaveMsg?.type === 'error' ? 'bg-red-50' : 'bg-blue-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{sub.course_code || sub.code || '-'}</td>
                    <td className="px-4 py-3">{sub.course_name || sub.name || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-4 w-full">
                        <div className="flex flex-col gap-2 flex-grow max-w-[16rem]">
                          <div className="flex gap-2 items-center h-6">
                            {isSavingThisSubject ? (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium whitespace-nowrap flex items-center gap-1">
                                <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                ✓ {tempSelectedFaculty || 'Saving...'}
                              </span>
                            ) : autoSaveMsg ? (
                              <span className={`text-xs px-2 py-1 rounded font-medium whitespace-nowrap ${autoSaveMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {autoSaveMsg.text}
                              </span>
                            ) : (
                              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded whitespace-nowrap">No Faculty</span>
                            )}
                          </div>
                          <SearchableDropdown
                            label=""
                            placeholder="Select Faculty"
                            options={facultyOptions}
                            value={tempSelectedValue || ""}
                            onChange={(value) => handleSubjectFacultyChange(`new-${sub.id}`, value)}
                          />
                        </div>
                        {isMultiFacultyAllowed && (
                          <div className="mt-8 flex-shrink-0">
                            <button onClick={() => setAdditionalDropdowns(prev => ({...prev, [sub.id]: (prev[sub.id] || 0) + 1}))} className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors border border-gray-300">
                              <Plus className="w-4 h-4" /> Add
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              } else {
                matchingAssignments.forEach((assignment, aIdx) => {
                  const assignedStaffId = assignment.staff_details?.staff_id || assignment.staff_id || assignment.staff || "";
                  const assignedStaffUserId = assignment.staff_details?.id || assignment.staff_details?.user?.id || assignment.staff || "";
                  
                  let staffDisplayName = null;
                  if (assignment.staff_details?.user) {
                    const firstName = assignment.staff_details.user.first_name || '';
                    const lastName = assignment.staff_details.user.last_name || '';
                    const fullName = `${firstName} ${lastName}`.trim();
                    if (fullName) staffDisplayName = `${fullName} (${assignment.staff_details.staff_id || ''})`;
                  }
                  
                  const matchingOption = facultyOptions.find(opt => 
                    String(opt.value) === String(assignedStaffUserId) || 
                    String(opt.value) === String(assignedStaffId) ||
                    String(opt.value) === String(assignment.staff) ||
                    String(opt.value) === String(assignment.staff_id)
                  );
                  const optionValue = matchingOption?.value || String(assignedStaffUserId || assignedStaffId || assignment.staff_id || assignment.staff || "");
                  
                  const isElective = !!assignment.elective_subject_details;
                  const displayCode = isElective ? assignment.elective_subject_details.course_code : (sub.course_code || sub.code || '-');
                  const displayName = isElective ? assignment.elective_subject_details.course_name : (sub.course_name || sub.name || '-');
                  
                  const currentFacultyOption = facultyOptions.find(opt => String(opt.value) === String(optionValue));
                  const currentFacultyLabel = currentFacultyOption?.label || staffDisplayName || optionValue;
                  
                  const isSavingThisSubject = subjectAutoSavingSet.has(String(sub.id));
                  const autoSaveMsg = subjectAutoMessages[String(sub.id)];
                  const tempSelectedValue = temporarySelection[String(sub.id)];
                  const tempSelectedFaculty = tempSelectedValue ? facultyOptions.find(opt => opt.value === tempSelectedValue)?.label : null;
                  const displayLabel = tempSelectedValue && isSavingThisSubject ? tempSelectedFaculty : currentFacultyLabel;

                  rows.push(
                    <tr key={`${idx}-${aIdx}`} className={`border-b hover:bg-gray-50 transition-colors ${autoSaveMsg?.type === 'error' ? 'bg-red-50' : 'bg-white'}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{displayCode} {isElective && <span className="text-xs text-blue-500 ml-1">(Elective)</span>}</td>
                      <td className="px-4 py-3">{displayName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-4 w-full">
                          <div className="flex flex-col gap-2 flex-grow max-w-[16rem]">
                            <div className="flex gap-2 items-center h-6">
                              {isSavingThisSubject ? (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium whitespace-nowrap flex items-center gap-1">
                                  <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                  ✓ {displayLabel || 'Saving...'}
                                </span>
                              ) : autoSaveMsg ? (
                                <span className={`text-xs px-2 py-1 rounded font-medium whitespace-nowrap ${autoSaveMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {autoSaveMsg.text}
                                </span>
                              ) : (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded whitespace-nowrap">✓ {displayLabel || 'No Data'}</span>
                              )}
                            </div>
                            <SearchableDropdown
                              label=""
                              placeholder="Select Faculty"
                              options={facultyOptions}
                              value={tempSelectedValue || optionValue || ""}
                              onChange={(value) => handleSubjectFacultyChange(String(sub.id), value, assignment.id)}
                            />
                          </div>
                          {isMultiFacultyAllowed && aIdx === matchingAssignments.length - 1 && (
                            <div className="mt-8 flex-shrink-0">
                              <button onClick={() => setAdditionalDropdowns(prev => ({...prev, [sub.id]: (prev[sub.id] || 0) + 1}))} className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors border border-gray-300">
                                <Plus className="w-4 h-4" /> Add
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                });
              }

              // Render any additional faculty dropdowns for multi-faculty support
              const extraCount = additionalDropdowns[sub.id] || 0;
              for (let i = 0; i < extraCount; i++) {
                const addKey = `add-${sub.id}-${i}`;
                const isSavingThisSubject = subjectAutoSavingSet.has(addKey);
                const autoSaveMsg = subjectAutoMessages[addKey];
                const tempSelectedValue = temporarySelection[addKey];
                const tempSelectedFaculty = tempSelectedValue ? facultyOptions.find(opt => opt.value === tempSelectedValue)?.label : null;
                
                rows.push(
                  <tr key={`${idx}-extra-${i}`} className="bg-blue-50/20 border-b">
                    <td colSpan={2} className="px-4 py-3 text-right text-sm text-gray-600 font-medium border-r border-gray-100">
                       <span className="flex items-center justify-end gap-2 text-blue-700">
                         <Users className="w-4 h-4" />
                         Co-Faculty
                       </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-4 w-full">
                        <div className="flex flex-col gap-2 flex-grow max-w-[16rem]">
                          <div className="flex gap-2 items-center h-6">
                             {isSavingThisSubject ? (
                               <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium whitespace-nowrap flex items-center gap-1">
                                 <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                 ✓ {tempSelectedFaculty || 'Saving...'}
                               </span>
                             ) : autoSaveMsg ? (
                               <span className={`text-xs px-2 py-1 rounded font-medium whitespace-nowrap ${autoSaveMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                 {autoSaveMsg.text}
                               </span>
                             ) : (
                               <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded whitespace-nowrap italic">Pending assignment...</span>
                             )}
                          </div>
                          <SearchableDropdown
                            label=""
                            placeholder="Select Faculty"
                            options={facultyOptions}
                            value={tempSelectedValue || ""}
                            onChange={(value) => {
                              handleSubjectFacultyChange(addKey, value).then(() => {
                                if (value && value !== 'DELETE') {
                                  // Remove the extra row UI, it will be rendered as an actual assignment upon refresh
                                  setAdditionalDropdowns(prev => ({...prev, [sub.id]: Math.max(0, (prev[sub.id] || 1) - 1)}));
                                }
                              });
                            }}
                          />
                        </div>
                        <div className="mt-8 flex-shrink-0">
                          <button 
                            onClick={() => setAdditionalDropdowns(prev => ({...prev, [sub.id]: Math.max(0, (prev[sub.id] || 1) - 1)}))}
                            className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-md transition-colors border border-transparent hover:border-red-200"
                            title="Cancel adding faculty"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }
              
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-3 mt-4">
      {years.map((year) => (
        <div key={year} className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
          <button
            onClick={() => toggleYear(year)}
            className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-gray-800 text-lg">{year}</span>
            {expandedYear === year ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
          </button>
          
          {expandedYear === year && (
            <div className="p-4 border-t border-gray-200">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Departments</h4>
                {getDynamicDepartments(year).map((dept) => (
                  <div key={dept.name} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <button
                      onClick={() => toggleDept(dept.name)}
                      className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium text-blue-700">{dept.name} Department</span>
                      {expandedDept === dept.name ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </button>
                    
                    {expandedDept === dept.name && (
                      <div className="p-3 bg-gray-50 border-t border-gray-200 space-y-2">
                        <h5 className="text-xs font-semibold text-gray-500 uppercase ml-1">Classes / Sections</h5>
                        {dept.sections.length > 0 ? (
                          dept.sections.map((section) => (
                            <div key={section.name} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                              <button
                                onClick={() => toggleSection(`${dept.name}-${section.name}`, section.id)}
                                className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-700">Section {section.name}</span>
                                  {sectionCurriculumLoading[`${dept.name}-${section.name}`] && (
                                    <Loader className="w-4 h-4 animate-spin text-blue-600" />
                                  )}
                                  {sectionCurriculumError[`${dept.name}-${section.name}`] && (
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                  )}
                                </div>
                                {expandedSection === `${dept.name}-${section.name}` ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                              </button>
                              {expandedSection === `${dept.name}-${section.name}` && (
                                <div className="p-3 bg-gray-50 border-t border-gray-200">
                                  {renderSubjectMapping(`${dept.name}-${section.name}`, section.id)}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-600 px-3 py-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded">
                            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <span>No sections configured for {dept.name} in this year. Check if batch-section mapping exists in the database.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

