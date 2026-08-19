import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, Award, Info, Sliders, Plus, Trash2, Layers } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

export interface CreditAllocationMap {
  [creditValue: number]: number;
}

export interface ClassTypeExceptionRule {
  id: string;
  classType: string;
  individualPeriods: number; // Separate single periods (e.g. 3)
  pairedPeriods: number; // Paired 2-consecutive block periods (default 0)
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAllocationsUpdated?: (allocations: CreditAllocationMap, exceptions?: ClassTypeExceptionRule[]) => void;
}

const STORAGE_KEY = 'iqac_timetable_credit_allocations';
const EXCEPTIONS_STORAGE_KEY = 'iqac_timetable_classtype_exceptions';
const DEFAULT_CREDIT_LEVELS = [1, 2, 3, 4, 5];

const AVAILABLE_CLASS_TYPES = [
  'THEORY',
  'LAB',
  'PRACTICAL',
  'TCPL',
  'TCPR',
  'PURE_LAB',
  'TUTORIAL',
  'PROJECT',
  'SEMINAR',
  'SPECIAL',
];

export default function CreditBasedAllocationModal({ isOpen, onClose, onAllocationsUpdated }: Props) {
  const [creditAllocations, setCreditAllocations] = useState<CreditAllocationMap>({
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
  });

  const [classTypeExceptions, setClassTypeExceptions] = useState<ClassTypeExceptionRule[]>([]);
  const [courseCreditCounts, setCourseCreditCounts] = useState<Record<number, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  // Load stored credit allocations & class type exceptions on mount/open
  useEffect(() => {
    if (!isOpen) return;

    try {
      const storedCredits = localStorage.getItem(STORAGE_KEY);
      if (storedCredits) {
        const parsed = JSON.parse(storedCredits);
        if (typeof parsed === 'object' && parsed !== null) {
          setCreditAllocations(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load credit allocations:', e);
    }

    try {
      const storedExceptions = localStorage.getItem(EXCEPTIONS_STORAGE_KEY);
      if (storedExceptions) {
        const parsed = JSON.parse(storedExceptions);
        if (Array.isArray(parsed)) {
          setClassTypeExceptions(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load class type exceptions:', e);
    }

    // Fetch curriculum courses to calculate course count per credit rating
    const fetchCurriculumCredits = async () => {
      setIsLoadingCounts(true);
      try {
        const [deptRes, masterRes] = await Promise.all([
          fetchWithAuth('/api/curriculum/department/?page_size=0'),
          fetchWithAuth('/api/curriculum/master/?page_size=0'),
        ]);

        const counts: Record<number, number> = {};

        const processList = (list: any[]) => {
          list.forEach((item: any) => {
            const cVal = Number(item.c ?? item.credits ?? 0);
            if (cVal > 0) {
              counts[cVal] = (counts[cVal] || 0) + 1;
            }
          });
        };

        if (deptRes.ok) {
          const dData = await deptRes.json();
          processList(dData.results || dData || []);
        }

        if (masterRes.ok) {
          const mData = await masterRes.json();
          processList(mData.results || mData || []);
        }

        setCourseCreditCounts(counts);
      } catch (err) {
        console.error('Failed to load curriculum course credit statistics:', err);
      } finally {
        setIsLoadingCounts(false);
      }
    };

    fetchCurriculumCredits();
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePeriodChange = (creditVal: number, periodVal: number) => {
    setCreditAllocations((prev) => ({
      ...prev,
      [creditVal]: Math.max(1, Math.min(10, periodVal || 1)),
    }));
  };

  const handleResetDefaults = () => {
    const defaults: CreditAllocationMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
    setCreditAllocations(defaults);
  };

  const handleAddExceptionRule = () => {
    const usedTypes = new Set(classTypeExceptions.map((r) => r.classType.toUpperCase()));
    const available = AVAILABLE_CLASS_TYPES.find((t) => !usedTypes.has(t)) || 'THEORY';

    const newRule: ClassTypeExceptionRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      classType: available,
      individualPeriods: 1,
      pairedPeriods: 0,
    };
    setClassTypeExceptions((prev) => [...prev, newRule]);
  };

  const handleRuleChange = (id: string, field: keyof ClassTypeExceptionRule, value: any) => {
    setClassTypeExceptions((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule))
    );
  };

  const handleDeleteRule = (id: string) => {
    setClassTypeExceptions((prev) => prev.filter((rule) => rule.id !== id));
  };

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(creditAllocations));
      localStorage.setItem(EXCEPTIONS_STORAGE_KEY, JSON.stringify(classTypeExceptions));
    } catch (e) {
      console.error('Failed to save credit allocations and exceptions to localStorage:', e);
    }

    if (onAllocationsUpdated) {
      onAllocationsUpdated(creditAllocations, classTypeExceptions);
    }

    alert('Credit-based period allocations and Class Type Exception Rules saved successfully!');
    onClose();
  };

  const allCreditLevels = Array.from(
    new Set([...DEFAULT_CREDIT_LEVELS, ...Object.keys(courseCreditCounts).map(Number)])
  ).sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-800 via-indigo-800 to-teal-800 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Award size={22} className="text-purple-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Credit-Based Period Allocations & Exception Rules</h2>
              <p className="text-xs text-purple-100/90">
                Configure timetable period generation per Credit rating (C) and Class Type Exception Rules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white/80 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Info Banner */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
            <Info size={20} className="text-purple-600 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-900 leading-relaxed">
              <p className="font-bold text-sm mb-1 text-purple-950">How Period Allocations & Exceptions Work:</p>
              <p>
                1. <strong>Class Type Exception Module (Top)</strong>: Allows defining custom period rules per Class Type (e.g. THEORY, LAB, PRACTICAL).
                Specify <strong>Individual Periods</strong> (single separate slots) and <strong>Paired Periods</strong> (2-consecutive-period block slots e.g. 1&2, 2&3).
              </p>
              <p className="mt-1">
                2. <strong>Credit to Period Mapping (Bottom)</strong>: Applies default timetable period generation for courses based on their Credit rating (C).
              </p>
            </div>
          </div>

          {/* TOP SECTION: Class Type Exception Module */}
          <div className="border border-purple-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="bg-gradient-to-r from-purple-100 to-indigo-50 px-4 py-3 border-b border-purple-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-purple-700" />
                <span className="text-xs font-extrabold text-purple-900 uppercase tracking-wider">
                  Class Type Exception Module
                </span>
                <span className="text-[11px] bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                  {classTypeExceptions.length} Rule(s)
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddExceptionRule}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3.5 py-1.5 rounded-lg font-bold shadow transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                Add Class Type Exception
              </button>
            </div>

            {classTypeExceptions.length === 0 ? (
              <div className="p-8 text-center bg-gray-50/50">
                <p className="text-xs text-gray-500 font-medium">
                  No class type exceptions added yet.
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Click <strong>"+ Add Class Type Exception"</strong> above to configure specific period & block period rules for class types (e.g., THEORY, LAB, PRACTICAL).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-purple-900 uppercase bg-purple-50/80 border-b border-purple-100">
                    <tr>
                      <th className="px-4 py-3">Class Type</th>
                      <th className="px-4 py-3">No of Periods (Individual)</th>
                      <th className="px-4 py-3">Paired Periods (Block)</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-100">
                    {classTypeExceptions.map((rule) => (
                      <tr key={rule.id} className="hover:bg-purple-50/40 transition-colors">
                        <td className="px-4 py-3">
                          <select
                            value={rule.classType}
                            onChange={(e) => handleRuleChange(rule.id, 'classType', e.target.value)}
                            className="w-full max-w-[160px] px-3 py-1.5 border border-purple-300 rounded-lg text-xs font-bold text-purple-900 bg-white focus:ring-2 focus:ring-purple-500 shadow-sm"
                          >
                            {AVAILABLE_CLASS_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={rule.individualPeriods}
                              onChange={(e) =>
                                handleRuleChange(rule.id, 'individualPeriods', Math.max(0, parseInt(e.target.value, 10) || 0))
                              }
                              className="w-20 px-2.5 py-1.5 border border-purple-300 rounded-lg text-sm font-bold text-center bg-white focus:ring-2 focus:ring-purple-500 shadow-sm"
                            />
                            <span className="text-xs text-gray-600 font-medium">single slot(s)</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={rule.pairedPeriods}
                              onChange={(e) =>
                                handleRuleChange(rule.id, 'pairedPeriods', Math.max(0, parseInt(e.target.value, 10) || 0))
                              }
                              className="w-20 px-2.5 py-1.5 border border-purple-300 rounded-lg text-sm font-bold text-center bg-white focus:ring-2 focus:ring-purple-500 shadow-sm"
                            />
                            <span className="text-xs text-gray-600 font-medium">
                              paired block(s) <span className="text-[10px] text-gray-400">(2 consecutive periods e.g. 2&3)</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Rule"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* BOTTOM SECTION: Credit to Period Mapping Table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders size={14} className="text-emerald-600" />
                Credit to Period Mapping
              </span>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-xs text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1"
              >
                <RefreshCw size={12} />
                Reset Defaults
              </button>
            </div>

            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-100/70 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Course Credit (C)</th>
                  <th className="px-4 py-3">Courses Found</th>
                  <th className="px-4 py-3">Default Periods</th>
                  <th className="px-4 py-3">Timetable Periods to Generate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allCreditLevels.map((creditVal) => {
                  const currentPeriods = creditAllocations[creditVal] ?? creditVal;
                  const courseCount = courseCreditCounts[creditVal] || 0;

                  return (
                    <tr key={creditVal} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-900">
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-extrabold border border-emerald-200">
                          {creditVal} {creditVal === 1 ? 'Credit' : 'Credits'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                        {isLoadingCounts ? (
                          <span className="text-gray-400">Counting...</span>
                        ) : (
                          <span>{courseCount} course(s)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-semibold">
                        {creditVal} Period(s)
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={currentPeriods}
                            onChange={(e) => handlePeriodChange(creditVal, parseInt(e.target.value, 10))}
                            className="w-24 px-3 py-1.5 border border-emerald-300 rounded-lg text-sm font-bold text-center bg-white focus:ring-2 focus:ring-emerald-500 shadow-sm"
                          />
                          <span className="text-xs text-gray-600 font-medium">
                            {currentPeriods === 1 ? 'period' : 'periods'} randomly placed
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors flex items-center gap-2"
          >
            <Save size={16} />
            Save Allocations & Exceptions
          </button>
        </div>

      </div>
    </div>
  );
}
