import React, { useState } from 'react';
import { Table, FileSpreadsheet } from 'lucide-react';
import COattainmentTable from './COattainmentTable';
import COAttainmentAnalysisPage from './COAttainmentAnalysisPage';

export default function COattainmentContainer({
  courseId,
  data,
  courseInfo,
}: {
  courseId?: string;
  data?: any;
  courseInfo?: any;
}) {
  const [subTab, setSubTab] = useState<'oa' | 'new_page'>('oa');

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b bg-gray-50/80 px-4 pt-3">
        <button
          type="button"
          onClick={() => setSubTab('oa')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            subTab === 'oa'
              ? 'border-blue-600 text-blue-600 bg-white shadow-xs rounded-t-md font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/70 rounded-t-md'
          }`}
        >
          <Table className="w-4 h-4 text-blue-500" />
          OA - CO Attainment
        </button>

        <button
          type="button"
          onClick={() => setSubTab('new_page')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            subTab === 'new_page'
              ? 'border-blue-600 text-blue-600 bg-white shadow-xs rounded-t-md font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/70 rounded-t-md'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
          CO Attainment Analysis
        </button>
      </div>

      {/* Sub-tab Content View */}
      <div className="p-0">
        {subTab === 'oa' && (
          <COattainmentTable courseId={courseId} data={data} />
        )}

        {subTab === 'new_page' && (
          <COAttainmentAnalysisPage courseId={courseId} data={data} courseInfo={courseInfo} />
        )}
      </div>
    </div>
  );
}
