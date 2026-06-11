import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Users, BookOpen } from 'lucide-react';
import { SearchableDropdown } from '../../../components/ui/SearchableDropdown';

interface Props {
  facultyOptions: { label: string; value: string }[];
}

export default function TeachingAssignSection({ facultyOptions }: Props) {
  const [expandedYear, setExpandedYear] = useState<string | null>(null);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const firstYearSections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  
  const departments = [
    { name: 'IT', sections: ['A'] },
    { name: 'AI&DS', sections: ['A', 'B'] },
    { name: 'AIML', sections: ['A'] },
    { name: 'CSE', sections: ['A', 'B', 'C'] },
    { name: 'ECE', sections: ['A', 'B'] },
    { name: 'EEE', sections: ['A'] },
    { name: 'MECH', sections: ['A'] },
    { name: 'CIVIL', sections: ['A'] }
  ];

  const subjects = [
    { code: 'CS101', name: 'Programming in C' },
    { code: 'MA101', name: 'Engineering Mathematics I' },
    { code: 'PH101', name: 'Engineering Physics' },
    { code: 'EN101', name: 'Technical English' },
    { code: 'EE101', name: 'Basic Electrical Engineering' }
  ];

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

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const renderSubjectMapping = (prefix: string) => (
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
            {subjects.map((sub, idx) => (
              <tr key={idx} className="bg-white border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{sub.code}</td>
                <td className="px-4 py-3">{sub.name}</td>
                <td className="px-4 py-3">
                  <SearchableDropdown
                    label=""
                    placeholder="Select Faculty"
                    options={facultyOptions}
                    value={""}
                    onChange={() => {}}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

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
              {year === '1st Year' ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">Sections</h4>
                  {firstYearSections.map((section) => (
                    <div key={section} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <button
                        onClick={() => toggleSection(section)}
                        className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <span className="font-medium text-gray-700">Section {section}</span>
                        {expandedSection === section ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </button>
                      {expandedSection === section && (
                        <div className="p-3 bg-gray-50 border-t border-gray-200">
                          {renderSubjectMapping(`${year}-Sec${section}`)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Departments</h4>
                  {departments.map((dept) => (
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
                          {dept.sections.map((section) => (
                            <div key={section} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                              <button
                                onClick={() => toggleSection(`${dept.name}-${section}`)}
                                className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                              >
                                <span className="font-medium text-gray-700">Section {section}</span>
                                {expandedSection === `${dept.name}-${section}` ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                              </button>
                              {expandedSection === `${dept.name}-${section}` && (
                                <div className="p-3 bg-gray-50 border-t border-gray-200">
                                  {renderSubjectMapping(`${year}-${dept.name}-Sec${section}`)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
