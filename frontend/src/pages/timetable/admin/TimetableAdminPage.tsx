import React, { useState, useEffect } from 'react';
import fetchWithAuth from '../../../services/fetchAuth';
import TimetableConfig from './OddEvenSemTimetable';
import TimetableCreator from './TimetableCreator';
import TimetableGenerator from './TimetableGenerator';
import GroupAllocationModal from './GroupAllocationModal';
import CreditBasedAllocationModal from './CreditBasedAllocationModal';
import VenueAllocationModal from './VenueAllocationModal';

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
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showVenueModal, setShowVenueModal] = useState(false);

  // Load templates from API on component mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetchWithAuth('/api/timetable/templates/');
        if (response.ok) {
          const data = await response.json();
          const parsedTemplates = [];
          for (const item of data) {
             let rows = [];
             let columns = [];
             try {
                if (item.description) {
                   const parsedDesc = JSON.parse(item.description);
                   if (parsedDesc.rows) rows = parsedDesc.rows;
                   if (parsedDesc.columns) columns = parsedDesc.columns;
                }
             } catch(e) {}

             // fallback mapping if empty
             if (columns.length === 0 && item.periods) {
                 columns = item.periods.map(p => ({
                     id: `col-${p.id}`,
                     title: `Column ${p.index}`,
                     period: p.label || `Period ${p.index}`,
                     timing: (p.start_time && p.end_time) ? `${p.start_time} - ${p.end_time}` : ''
                 }));
             }
             if (rows.length === 0) {
                 const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                 rows = DAYS.map((d, i) => ({ id: `row-${i+1}`, day: d }));
             }

             parsedTemplates.push({
                 id: item.id.toString(),
                 name: item.name,
                 semesterType: item.parity ? item.parity.toLowerCase() : 'odd',
                 columns,
                 rows,
                 createdAt: item.created_at
             });
          }
          
          setSemesterTemplates(parsedTemplates);
          // the other templates use the same struct
          const normalized = parsedTemplates.map((t: any) => normalizeTemplate(t));
          setTemplates(normalized);
        }
      } catch (error) {
        console.error('Error fetching templates:', error);
      }
    };
    fetchTemplates();
  }, []);

  const handleSaveSemesterTemplate = async (template: SemesterTemplate) => {
    try {
      const payload = {
         id: template.id,
         name: template.name,
         semesterType: template.semesterType,
         columns: template.columns,
         rows: template.rows
      };
      
      const response = await fetchWithAuth('/api/timetable/templates/save_frontend_template/', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(payload)
      });
      
      if (response.ok) {
         const data = await response.json();
         const finalTemplate = { ...template, id: data.id.toString() };
         setSemesterTemplates((prev) => {
            const existing = prev.findIndex((t) => t.id === finalTemplate.id || t.id === template.id);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = finalTemplate;
              return updated;
            }
            return [...prev, finalTemplate];
         });
         const normFinal = normalizeTemplate(finalTemplate as any);
         setTemplates((prev) => {
            const existing = prev.findIndex((t) => t.id === normFinal.id || t.id === template.id);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = normFinal;
              return updated;
            }
            return [...prev, normFinal];
         });
      }
    } catch (e) {
      console.error('Save failed:', e);
      alert('Failed to save template to server.');
    }
  };

  const handleDeleteSemesterTemplate = async (templateId: string) => {
    try {
      if (!templateId.toString().startsWith('template-')) {
          await fetchWithAuth(`/api/timetable/templates/${templateId}/`, {
             method: 'DELETE'
          });
      }
      setSemesterTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (e) {
      console.error('Delete failed:', e);
      alert('Failed to delete template from server.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <h1 className="text-3xl font-bold text-gray-900">Timetable Administration - IQAC</h1>
          <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
            <button
              onClick={() => setShowGroupModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2"
            >
              🏢 Group Allocation
            </button>
            <button
              onClick={() => setShowCreditModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2"
            >
              🎯 Credit Allocations
            </button>
            <button
              onClick={() => setShowVenueModal(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2"
            >
              🏛️ Venue Exceptions
            </button>
          </div>
        </div>

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

        {/* Group Allocation Modal */}
        <GroupAllocationModal
          isOpen={showGroupModal}
          onClose={() => setShowGroupModal(false)}
        />

        {/* Credit Based Allocation Modal */}
        <CreditBasedAllocationModal
          isOpen={showCreditModal}
          onClose={() => setShowCreditModal(false)}
        />

        {/* Venue Allocation Modal */}
        <VenueAllocationModal
          isOpen={showVenueModal}
          onClose={() => setShowVenueModal(false)}
        />
      </div>
    </div>
  );
}
