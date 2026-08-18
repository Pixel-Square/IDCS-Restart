import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, Layers, Award, Info, Sliders } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

export interface CreditAllocationMap {
  [creditValue: number]: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAllocationsUpdated?: (allocations: CreditAllocationMap) => void;
}

const STORAGE_KEY = 'iqac_timetable_credit_allocations';
const DEFAULT_CREDIT_LEVELS = [1, 2, 3, 4, 5];

export default function CreditBasedAllocationModal({ isOpen, onClose, onAllocationsUpdated }: Props) {
  const [creditAllocations, setCreditAllocations] = useState<CreditAllocationMap>({
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
  });

  const [courseCreditCounts, setCourseCreditCounts] = useState<Record<number, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  // Load stored credit allocations on mount/open
  useEffect(() => {
    if (!isOpen) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null) {
          setCreditAllocations(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load credit allocations:', e);
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

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(creditAllocations));
    } catch (e) {
      console.error('Failed to save credit allocations to localStorage:', e);
    }

    if (onAllocationsUpdated) {
      onAllocationsUpdated(creditAllocations);
    }

    alert('Credit-based period allocations saved successfully!');
    onClose();
  };

  const allCreditLevels = Array.from(
    new Set([...DEFAULT_CREDIT_LEVELS, ...Object.keys(courseCreditCounts).map(Number)])
  ).sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Award size={22} className="text-emerald-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Credit-Based Period Allocations</h2>
              <p className="text-xs text-emerald-100/90">
                Configure timetable periods assigned to courses based on Credit rating (C)
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
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <Info size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900 leading-relaxed">
              <p className="font-bold text-sm mb-1 text-emerald-950">How Credit Allocations Work:</p>
              <p>
                Courses in the curriculum carry a Credit value (referred to as <strong>"C"</strong> in department curriculum).
                By default, a 4-Credit course gets 4 timetable periods.
              </p>
              <p className="mt-1">
                You can customize the number of periods generated for any credit rating. For example, if a <strong>4 Credit</strong> course is set to <strong>3 Periods</strong>, the timetable generator will randomly distribute <strong>3 non-block periods</strong> across the week.
              </p>
            </div>
          </div>

          {/* Allocation Table */}
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
            Save Credit Allocations
          </button>
        </div>

      </div>
    </div>
  );
}
