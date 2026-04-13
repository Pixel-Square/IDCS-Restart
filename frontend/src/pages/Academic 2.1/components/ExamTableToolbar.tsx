/**
 * ExamTableToolbar Component
 * Reusable toolbar for exam tables with search, filter, and export options
 */

import React from 'react';
import { Search, Filter, Download, Upload, RefreshCw } from 'lucide-react';

interface ExamTableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  filters?: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }[];
  onRefresh?: () => void;
  onExport?: () => void;
  onImport?: () => void;
  exportLabel?: string;
  importLabel?: string;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export default function ExamTableToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  onRefresh,
  onExport,
  onImport,
  exportLabel = 'Export',
  importLabel = 'Import',
  isLoading = false,
  children,
}: ExamTableToolbarProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Filters */}
        {filters.map((filter, index) => (
          <div key={index} className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">{filter.label}:</span>
            <select
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
            >
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}

          {onImport && (
            <button
              onClick={onImport}
              className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              <Upload className="w-4 h-4" />
              {importLabel}
            </button>
          )}

          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              {exportLabel}
            </button>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}

// Quick filter button group component
interface QuickFilterProps {
  options: { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
}

export function QuickFilter({ options, selected, onChange }: QuickFilterProps) {
  return (
    <div className="flex items-center gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 rounded-lg text-sm transition-colors ${
            selected === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Status badge component
interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'default';
  label: string;
  icon?: React.ReactNode;
}

export function StatusBadge({ status, label, icon }: StatusBadgeProps) {
  const colors = {
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    default: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`flex items-center gap-1 px-2 py-1 rounded text-sm ${colors[status]}`}>
      {icon}
      {label}
    </span>
  );
}

// Progress indicator component
interface ProgressIndicatorProps {
  current: number;
  total: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ProgressIndicator({ current, total, showLabel = true, size = 'sm' }: ProgressIndicatorProps) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  const isComplete = percentage === 100;
  const height = size === 'sm' ? 'h-2' : 'h-3';

  return (
    <div>
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span>
          <span>{current}/{total}</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${height}`}>
        <div
          className={`${height} rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
