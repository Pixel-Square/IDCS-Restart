import React, { useState, useEffect } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { getLeaveBalances, getActiveTemplates } from '../services/staffRequests';
import type { LeaveBalance, RequestTemplate } from '../types/staffRequests';

export default function LeaveBalanceBadges() {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, tmpl] = await Promise.all([getLeaveBalances(), getActiveTemplates()]);
      const actualBalances = data.balances || [];
      setTemplates(tmpl || []);
      
      // Create a map of actual balances by leave type
      const balanceMap = new Map<string, LeaveBalance>();
      actualBalances.forEach(bal => {
        balanceMap.set(bal.leave_type.toLowerCase(), bal);
      });
      
      // Get user's role hierarchy for allotment lookup
      const roleHierarchy = ['HOD', 'AHOD', 'FACULTY', 'STAFF'];
      
      // Build combined balance list: start with actual balances
      const combinedBalances: LeaveBalance[] = [...actualBalances];
      const overdraftNames = new Set<string>();
      
      // Add template entries that don't exist in actual balances
      tmpl.forEach(template => {
        // Check if template has leave_policy configured (has action OR allotment_per_role)
        const hasLeavePolicy = template.leave_policy &&
          (template.leave_policy.action || template.leave_policy.allotment_per_role);
        
        if (hasLeavePolicy) {
          const leaveType = template.name;
          const leaveTypeLower = leaveType.toLowerCase();
          
          // Get action, default to 'deduct' if not specified but allotment exists
          const action = template.leave_policy.action || 'deduct';
          
          // Collect overdraft names (LOP)
          if (template.leave_policy.overdraft_name) {
            overdraftNames.add(template.leave_policy.overdraft_name);
          }
          
          // Only add if not already in actual balances
          if (!balanceMap.has(leaveTypeLower)) {
            // Find allotment for this template
            let allotment = 0;
            if (template.leave_policy.allotment_per_role) {
              for (const role of roleHierarchy) {
                if (template.leave_policy.allotment_per_role[role] !== undefined) {
                  allotment = template.leave_policy.allotment_per_role[role];
                  break;
                }
              }
            }
            
            // Show initial balance: allotment for deduct, 0 for earn/neutral
            const initialBalance = {
              leave_type: leaveType,
              balance: action === 'deduct' ? allotment : 0,
              updated_at: undefined
            };
            combinedBalances.push(initialBalance);
          }
        }
      });
      
      // Add overdraft entries (LOP) if not already present
      overdraftNames.forEach(overdraftName => {
        const overdraftLower = overdraftName.toLowerCase();
        if (!balanceMap.has(overdraftLower) && !combinedBalances.find(b => b.leave_type.toLowerCase() === overdraftLower)) {
          combinedBalances.push({
            leave_type: overdraftName,
            balance: 0,
            updated_at: undefined
          });
        }
      });
      
      setBalances(combinedBalances);
    } catch (err: any) {
      console.error('Failed to fetch leave balances:', err);
      setError('Failed to load balances');
    } finally {
      setLoading(false);
    }
  };

  const getBadgeColor = (leaveType: string): string => {
    const type = leaveType.toUpperCase();
    
    // Red for LOP/Overdraft
    if (type.includes('LOP') || type.includes('OVERDRAFT')) {
      return 'bg-red-100 text-red-800 border-red-300';
    }
    
    // Purple/Yellow for Earn/Neutral types (OD, COL, etc.)
    if (type.includes('OD') || type.includes('COL') || type.includes('COMP')) {
      return 'bg-purple-100 text-purple-800 border-purple-300';
    }
    
    // Blue/Green for standard deduct leave types (CL, SL, EL, etc.)
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <Clock className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading leave balances...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-red-600">{error}</span>
          <button
            onClick={fetchBalances}
            className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Leave Balances</h3>
          <button
            onClick={fetchBalances}
            className="text-gray-400 hover:text-gray-600"
            title="Refresh balances"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center py-3">
          <p className="text-sm text-gray-500 mb-1">No leave balances tracked yet</p>
          <p className="text-xs text-gray-400">Balances will appear after your first approved leave request</p>
        </div>
      </div>
    );
  }

  // Render condensed single-line summary: e.g. "Leave request: 21, LOP: 0, On Duty: 0, Compensatory leave: 0"
  const formatNumber = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

  // Preferred ordering for display
  const preferredOrder = ['Leave request', 'LOP', 'ON duty', 'Compensatory leave'];

  const sorted = [...balances].sort((a, b) => {
    const ai = preferredOrder.indexOf(a.leave_type);
    const bi = preferredOrder.indexOf(b.leave_type);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 1 : ai) - (bi === -1 ? 1 : bi);
    return a.leave_type.localeCompare(b.leave_type);
  });

  const summary = sorted.map(b => `${b.leave_type} : ${formatNumber(b.balance)}`).join(' , ');

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Leave Balances</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBalances}
            className="text-gray-400 hover:text-gray-600"
            title="Refresh balances"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-700">
        {summary || <span className="text-gray-500">No leave balances tracked yet</span>}
      </div>
    </div>
  );
}
