import React, { useState } from 'react';
import { X, User, Calendar, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { processApproval } from '../../services/staffRequests';
import type { StaffRequest } from '../../types/staffRequests';
import { formatFieldLabel, renderFormValue } from './formValueUtils';

const initialsFromName = (name: string) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('') || 'U';

interface ApprovalReviewModalProps {
  request: StaffRequest;
  onClose: () => void;
  onProcessed: () => void;
}

export default function ApprovalReviewModal({ request, onClose, onProcessed }: ApprovalReviewModalProps) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!action) {
      setError('Please select an action (Approve or Reject)');
      return;
    }

    if (action === 'reject' && !comments.trim()) {
      setError('Please provide comments explaining the reason for rejection');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await processApproval(request.id, { action, comments: comments.trim() });
      onProcessed();
    } catch (err: any) {
      setError(err?.response?.data?.detail || `Failed to ${action} the request`);
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (step: any) => {
    if (step.status === 'approved') {
      return <CheckCircle className="text-green-600" size={20} />;
    } else if (step.status === 'rejected') {
      return <XCircle className="text-red-600" size={20} />;
    } else if (step.is_current) {
      return <Clock className="text-yellow-600" size={20} />;
    } else {
      return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Review Request</h2>
            <p className="text-sm text-gray-600 mt-1">
              {request.template.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={submitting}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Applicant Information */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">Applicant Information</h3>

            <div className="mb-4 p-3 bg-white/60 border border-blue-100 rounded-lg flex items-center gap-3">
              {request.applicant.profile_image ? (
                <img
                  src={request.applicant.profile_image}
                  alt={request.applicant.full_name || request.applicant.username}
                  className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                  {initialsFromName(request.applicant.full_name || request.applicant.username)}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <User size={16} className="text-blue-600" />
                <span className="font-medium text-gray-700">Name:</span>
                <span className="text-gray-900">{request.applicant.full_name || request.applicant.username}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-blue-600" />
                <span className="font-medium text-gray-700">Submitted:</span>
                <span className="text-gray-900">{formatDate(request.created_at)}</span>
              </div>
              {request.applicant.email && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700">Email:</span>
                  <span className="text-gray-900">{request.applicant.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Status:</span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                  {request.status}
                </span>
              </div>
            </div>
          </div>

          {/* Request Details */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Request Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(request.form_data).map(([key, value]) => (
                <div key={key} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    {formatFieldLabel(key)}
                  </p>
                  <p className="text-sm text-gray-900 break-words">
                    {renderFormValue(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Approval Workflow Timeline */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Approval Workflow Timeline</h3>
            <div className="space-y-4">
              {request.workflow_progress?.map((step, index) => (
                <div key={index} className="relative flex gap-4">
                  {/* Timeline Line */}
                  {index < request.workflow_progress!.length - 1 && (
                    <div className="absolute left-[10px] top-[28px] w-[2px] h-[calc(100%+16px)] bg-gray-300" />
                  )}

                  {/* Status Icon */}
                  <div className="relative z-10 mt-1">
                    {getStatusIcon(step)}
                  </div>

                  {/* Step Details */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          Step {step.step_order}: {step.approver_role}
                        </h4>
                        <p className="text-sm text-gray-600 capitalize">
                          Status: {step.status ? step.status : step.is_current ? 'pending' : 'awaiting'}
                        </p>
                      </div>
                      {step.is_current && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded font-medium">
                          Your Turn
                        </span>
                      )}
                    </div>

                    {step.approver && (
                      <p className="text-sm text-gray-700 mb-1">
                        <span className="font-medium">Approver:</span> {step.approver.full_name || step.approver.username}
                      </p>
                    )}

                    {step.action_date && (
                      <p className="text-xs text-gray-600 mb-1">
                        {formatDate(step.action_date)}
                      </p>
                    )}

                    {step.comments && (
                      <div className="mt-2 bg-gray-50 rounded p-2">
                        <p className="text-xs font-medium text-gray-700">Comments:</p>
                        <p className="text-sm text-gray-900 italic">{step.comments}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Decision Section */}
          <div className="bg-gray-50 rounded-lg p-6 border-2 border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Decision</h3>
            
            {/* Action Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Action <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setAction('approve')}
                  disabled={submitting}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                    action === 'approve'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-300 hover:border-green-300'
                  } disabled:opacity-50`}
                >
                  <CheckCircle size={20} className="inline mr-2" />
                  Approve
                </button>
                <button
                  onClick={() => setAction('reject')}
                  disabled={submitting}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                    action === 'reject'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-300 hover:border-red-300'
                  } disabled:opacity-50`}
                >
                  <XCircle size={20} className="inline mr-2" />
                  Reject
                </button>
              </div>
            </div>

            {/* Comments */}
            <div className="mb-4">
              <label htmlFor="comments" className="block text-sm font-medium text-gray-700 mb-2">
                Comments {action === 'reject' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                id="comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                disabled={submitting}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                placeholder={
                  action === 'reject'
                    ? 'Please provide reason for rejection...'
                    : 'Optional comments (e.g., "Approved for 3 days", "Contact HR for further clarification")'
                }
              />
              {action === 'reject' && (
                <p className="text-xs text-gray-600 mt-1">
                  <AlertCircle size={12} className="inline mr-1" />
                  Comments are required when rejecting a request
                </p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting || !action}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : action === 'reject'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                } disabled:opacity-50`}
              >
                {submitting ? 'Processing...' : action ? `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}` : 'Select Action'}
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
