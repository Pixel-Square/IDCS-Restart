import React from 'react';
import { X, CheckCircle, XCircle, Clock, User } from 'lucide-react';
import type { StaffRequest } from '../../types/staffRequests';
import { formatFieldLabel, renderFormValue } from './formValueUtils';

interface Props {
  request: StaffRequest;
  onClose: () => void;
}

export default function RequestDetailsModal({ request, onClose }: Props) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStepStatus = (step: any) => {
    if (step.is_completed) {
      return step.status === 'approved' ? 'approved' : 'rejected';
    }
    if (step.is_current) {
      return 'current';
    }
    return 'pending';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-green-600';
      case 'rejected': return 'text-red-600';
      case 'current': return 'text-blue-600';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={24} className="text-green-600" />;
      case 'rejected': return <XCircle size={24} className="text-red-600" />;
      case 'current': return <Clock size={24} className="text-blue-600 animate-pulse" />;
      default: return <div className="w-6 h-6 rounded-full border-2 border-gray-300" />;
    }
  };

  const initials = (name: string) =>
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0]?.toUpperCase())
      .join('') || 'U';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{request.template.name}</h2>
              <p className="text-sm text-gray-600 mt-1">
                Submitted on {formatDate(request.created_at)}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          
          {/* Status Badge */}
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 text-sm font-medium rounded ${
                request.status === 'approved'
                  ? 'bg-green-100 text-green-800'
                  : request.status === 'rejected'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {request.status === 'approved' && <CheckCircle size={16} />}
              {request.status === 'rejected' && <XCircle size={16} />}
              {request.status === 'pending' && <Clock size={16} />}
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </span>
          </div>

          {/* Applicant Card */}
          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3">
            {request.applicant.profile_image ? (
              <img
                src={request.applicant.profile_image}
                alt={request.applicant.full_name || request.applicant.username}
                className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                {initials(request.applicant.full_name || request.applicant.username)}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {request.applicant.full_name || request.applicant.username}
              </div>
              <div className="text-xs text-gray-600 truncate">
                {request.applicant.staff_id || request.applicant.username}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Submitted Data */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
              {Object.entries(request.form_data).map(([key, value]) => (
                <div key={key}>
                  <div className="text-sm font-medium text-gray-700 mb-1">
                    {formatFieldLabel(key)}
                  </div>
                  <div className="text-sm text-gray-900 break-words">
                    {renderFormValue(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow Progress Timeline */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Approval Timeline</h3>
            
            {request.workflow_progress && request.workflow_progress.length > 0 ? (
              <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gray-200" />
                
                <div className="space-y-6">
                  {request.workflow_progress.map((step, index) => {
                    const status = getStepStatus(step);
                    return (
                      <div key={index} className="relative flex gap-4 items-start">
                        {/* Icon */}
                        <div className="relative z-10 flex-shrink-0 bg-white">
                          {getStatusIcon(status)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-6">
                          <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className={`font-semibold ${getStatusColor(status)}`}>
                                  Step {step.step_order}: {step.approver_role}
                                </h4>
                                {status === 'current' && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    Awaiting approval...
                                  </p>
                                )}
                              </div>
                              {step.is_completed && (
                                <span
                                  className={`px-2 py-1 text-xs font-medium rounded ${
                                    step.status === 'approved'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {step.status}
                                </span>
                              )}
                            </div>

                            {step.is_completed && step.approver && (
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2 text-gray-700">
                                  <User size={16} />
                                  <span>{step.approver.full_name || step.approver.username}</span>
                                </div>
                                <div className="text-gray-600">
                                  {formatDate(step.action_date!)}
                                </div>
                                {step.comments && (
                                  <div className="mt-2 p-3 bg-gray-50 rounded border-l-4 border-gray-300">
                                    <p className="text-gray-700 italic">"{step.comments}"</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-gray-600 text-center py-4">No workflow progress available</p>
            )}
          </div>

          {/* Approval Logs (if no workflow_progress) */}
          {(!request.workflow_progress || request.workflow_progress.length === 0) && 
           request.approval_logs && request.approval_logs.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Approval History</h3>
              <div className="space-y-3">
                {request.approval_logs.map((log) => (
                  <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          Step {log.step_order}: {log.approver_role}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {log.approver.full_name || log.approver.username}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          log.action === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.action}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{formatDate(log.action_date)}</p>
                    {log.comments && (
                      <p className="text-sm text-gray-700 italic bg-gray-50 p-2 rounded">
                        "{log.comments}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
