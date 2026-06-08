import React, { useState, useEffect } from 'react';
import TimetableConfig from './TimetableConfig';
import TimetableCreator from './TimetableCreator';
import TimetableGenerator from './TimetableGenerator';

interface TimetableTemplate {
  id: string;
  name: string;
  columns: Array<{
    id: string;
    title: string;
    period: string;
    timing: string;
  }>;
  rows: Array<{
    id: string;
    day: string;
  }>;
  createdAt: string;
}

interface SemesterTemplate {
  id: string;
  name: string;
  semesterType: 'odd' | 'even';
  columns: Array<{
    id: string;
    title: string;
    period: string;
    timing: string;
  }>;
  rows: Array<{
    id: string;
    day: string;
  }>;
  createdAt: string;
}

const STORAGE_KEY = 'iqac_timetable_templates';
const SEM_STORAGE_KEY = 'iqac_semester_timetable_templates';

const PERIODS = [
  'Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5',
  'Period 6', 'Period 7', 'Period 8', 'Period 9', 'Period 10',
  'Period 11', 'Period 12', 'Period 13', 'Period 14', 'Period 15',
];

// Helper function to normalize template periods to ensure they start from Period 1
const normalizeTemplate = (template: TimetableTemplate): TimetableTemplate => {
  const normalizedColumns = template.columns.map((col, index) => {
    const periodIndex = Math.min(index, PERIODS.length - 1);
    return {
      ...col,
      period: PERIODS[periodIndex],
      timing: col.timing || '', // Preserve timing
    };
  });

  return {
    ...template,
    columns: normalizedColumns,
  };
};

export default function TimetableAdminPage() {
  const [activeTab, setActiveTab] = useState<'config' | 'timetable_generator' | 'creator'>('config');
  const [templates, setTemplates] = useState<TimetableTemplate[]>([]);
  const [semesterTemplates, setSemesterTemplates] = useState<SemesterTemplate[]>([]);

  // Load templates from localStorage on component mount
  useEffect(() => {
    try {
      const savedTemplates = localStorage.getItem(STORAGE_KEY);
      if (savedTemplates) {
        const parsed = JSON.parse(savedTemplates);
        const normalized = parsed.map((t: TimetableTemplate) => normalizeTemplate(t));
        setTemplates(normalized);
      }

      const savedSemTemplates = localStorage.getItem(SEM_STORAGE_KEY);
      if (savedSemTemplates) {
        const parsed = JSON.parse(savedSemTemplates);
        setSemesterTemplates(parsed);
      }
    } catch (error) {
      console.error('Error loading templates from localStorage:', error);
    }
  }, []);

  // Sync templates to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch (error) {
      console.error('Error saving templates to localStorage:', error);
    }
  }, [templates]);

  // Sync semester templates to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(SEM_STORAGE_KEY, JSON.stringify(semesterTemplates));
    } catch (error) {
      console.error('Error saving semester templates to localStorage:', error);
    }
  }, [semesterTemplates]);

  const handleSaveTemplate = (template: TimetableTemplate) => {
    setTemplates((prev) => {
      const existing = prev.findIndex((t) => t.id === template.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = template;
        return updated;
      }
      return [...prev, template];
    });
  };

  const handleDeleteTemplate = (templateId: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  const handleSaveSemesterTemplate = (template: SemesterTemplate) => {
    setSemesterTemplates((prev) => {
      const existing = prev.findIndex((t) => t.id === template.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = template;
        return updated;
      }
      return [...prev, template];
    });
  };

  const handleDeleteSemesterTemplate = (templateId: string) => {
    setSemesterTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Timetable Administration - IQAC</h1>

        {/* Tab Buttons */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'config'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Config (Create Template)
          </button>
          <button
            onClick={() => setActiveTab('timetable_generator')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'timetable_generator'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Timetable Generator
          </button>
          <button
            onClick={() => setActiveTab('creator')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'creator'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Creator (Use Template)
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'config' && (
          <TimetableConfig templates={semesterTemplates} onSaveTemplate={handleSaveSemesterTemplate} onDeleteTemplate={handleDeleteSemesterTemplate} />
        )}
        {activeTab === 'timetable_generator' && (
          <TimetableGenerator templates={semesterTemplates} />
        )}
        {activeTab === 'creator' && <TimetableCreator templates={templates} />}
      </div>
    </div>
  );
}
