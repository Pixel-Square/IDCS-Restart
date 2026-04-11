
import React, { useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';

// Only renders a row, triggers parent to open modal
export default function ElectiveRowWithAdd({ elective, onAddClick }: { elective: any, onAddClick: (elective: any) => void }) {
  return (
    <tr className="transition-colors hover:bg-slate-50">
      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{elective.course_code}</td>
      <td className="px-4 py-3 text-sm text-slate-700">{elective.course_name}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{elective.parent_name || '-'}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{elective.regulation || '-'}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{elective.semester || '-'}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{elective.department?.code ? `${elective.department.code} - ${elective.department.short_name || elective.department.name}` : '-'}</td>
      <td className="px-4 py-3 text-center text-sm font-semibold text-indigo-700">{elective.student_count ?? 0}</td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => onAddClick(elective)}
          className="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-emerald-700"
        >Add</button>
      </td>
    </tr>
  );
}