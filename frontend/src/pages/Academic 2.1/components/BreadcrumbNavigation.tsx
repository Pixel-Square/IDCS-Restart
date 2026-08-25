import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbLevel {
  id: string;
  label: string;
  type: 'COLLEGE' | 'DEPARTMENT' | 'FACULTY' | 'SUBJECT' | 'STUDENT';
}

interface Props {
  path: BreadcrumbLevel[];
  onNavigate: (index: number) => void;
}

export default function BreadcrumbNavigation({ path, onNavigate }: Props) {
  return (
    <nav className="flex items-center space-x-2 text-sm font-medium text-slate-500 mb-6">
      {path.map((level, index) => (
        <React.Fragment key={level.id}>
          {index > 0 && <ChevronRight className="w-4 h-4 text-slate-400" />}
          <button
            onClick={() => onNavigate(index)}
            className={`hover:text-blue-600 transition-colors ${index === path.length - 1 ? 'text-blue-700 font-bold' : ''}`}
          >
            {level.label}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}
