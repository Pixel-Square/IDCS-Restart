import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Users, BookOpen } from 'lucide-react';
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
          if (!dName) return false;
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
      if (!sectionCurriculum[sectionKey] && sectionId) {
        try {
          const res = await fetchWithAuth(`/api/timetable/curriculum-for-section/?section_id=${sectionId}`);
          if (res.ok) {
            const data = await res.json();
            setSectionCurriculum(prev => ({ ...prev, [sectionKey]: data.results || data }));
          }
        } catch (err) {
          console.error(err);
        }
      }
    }
  };

  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const res = await fetchWithAuth('/api/academics/teaching-assignments/?page_size=0');
        if (res.ok) {
          const data = await res.json();
          setAssignments(data.results || data);
        }
      } catch (err) {
        console.error('Failed to fetch assignments:', err);
      }
    };
    fetchAssignments();
  }, []);

  const renderSubjectMapping = (sectionKey: string, sectionId: number) => {
    const subjects = sectionCurriculum[sectionKey] || [];
    
    return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm mt-3">
      <div className="mb-4 flex items-center justify-between border-b pb-4">
        <h4 className="font-semibold text-gray-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          Class Advisor Assignment
        </h4>
        <div className="w-64">
          <SearchableDropdown
            label=""
            placeholder="Select Class Advisor"
            options={facultyOptions}
            value={""}
            onChange={() => {}}
          />
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
              
              const matchingAssignments = assignments.filter(a => {
                const sectionIdMatch = a.section == sectionId || (a.section_details && a.section_details.id == sectionId);
                const sectionNameMatch = a.section_name === sectionNameStr || (a.section_details && a.section_details.name === sectionNameStr);
                
                const subjectMatch = a.curriculum_row == sub.id || 
                                     (a.curriculum_row_details && a.curriculum_row_details.id == sub.id);
                
                const electiveMatch = a.elective_subject_details && a.elective_subject_details.parent_id == sub.id;
                
                if (subjectMatch) {
                   return sectionIdMatch;
                } else if (electiveMatch) {
                   const elDept = (a.elective_subject_details.department_display || '').toLowerCase();
                   const elDeptId = String(a.elective_subject_details.department_id || '');
                   const isDeptMatch = allowedDeptNames.some(d => elDept.includes(d) || elDeptId === d);
                   
                   if (isDeptMatch && sectionNameMatch) {
                       return true;
                   }
                   return sectionIdMatch;
                }
                return false;
              });

              if (matchingAssignments.length === 0) {
                return [
                  <tr key={idx} className="bg-white border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{sub.course_code || sub.code || '-'}</td>
                    <td className="px-4 py-3">{sub.course_name || sub.name || '-'}</td>
                    <td className="px-4 py-3">
                      <SearchableDropdown
                        label=""
                        placeholder="Select Faculty"
                        options={facultyOptions}
                        value=""
                        onChange={() => {}}
                      />
                    </td>
                  </tr>
                ];
              }

              return matchingAssignments.map((assignment, aIdx) => {
                const assignedStaffId = assignment.staff_details?.staff_id || assignment.staff || "";
                
                const isElective = !!assignment.elective_subject_details;
                const displayCode = isElective ? assignment.elective_subject_details.course_code : (sub.course_code || sub.code || '-');
                const displayName = isElective ? assignment.elective_subject_details.course_name : (sub.course_name || sub.name || '-');

                return (
                  <tr key={`${idx}-${aIdx}`} className="bg-white border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{displayCode} {isElective && <span className="text-xs text-blue-500 ml-1">(Elective)</span>}</td>
                    <td className="px-4 py-3">{displayName}</td>
                    <td className="px-4 py-3">
                      <SearchableDropdown
                        label=""
                        placeholder="Select Faculty"
                        options={facultyOptions}
                        value={assignedStaffId ? String(assignedStaffId) : ""}
                        onChange={() => {}}
                      />
                    </td>
                  </tr>
                );
              });
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
                                <span className="font-medium text-gray-700">Section {section.name}</span>
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
                          <div className="text-sm text-gray-500 italic px-2 py-1">No sections configured for this semester in the database.</div>
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

