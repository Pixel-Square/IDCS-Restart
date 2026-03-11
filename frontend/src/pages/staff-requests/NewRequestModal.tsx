import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getActiveTemplates, createRequest, filterTemplatesForDate } from '../../services/staffRequests';
import type { RequestTemplate, FormField } from '../../types/staffRequests';
import DynamicFormRenderer from './DynamicFormRenderer';

interface Props {
  onClose: () => void;
  onCreated?: () => void;
  onSuccess?: () => void;
  preselectedDate?: string | null;
}

export default function NewRequestModal({ onClose, onCreated, onSuccess, preselectedDate }: Props) {
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<RequestTemplate | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMessage, setFilterMessage] = useState<string | null>(null);
  const [colInfo, setColInfo] = useState<any | null>(null);
  const [useColClaim, setUseColClaim] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setFilterMessage(null);
    try {
      let data: RequestTemplate[];
      let message: string | undefined;
      
      // Use filtered templates if date is provided
      if (preselectedDate) {
        const result = await filterTemplatesForDate(preselectedDate);
        data = result.templates;
        message = result.message;
        if (message) {
          setFilterMessage(message);
        }
      } else {
        data = await getActiveTemplates();
      }
      
      setTemplates(data);
      // Fetch COL claim info (balance + claimable dates)
      try {
        const info = await (await import('../../services/staffRequests')).getColClaimableInfo();
        setColInfo(info);
      } catch (e) {
        setColInfo(null);
      }
      if (data.length === 0) {
        if (!message) {
          setError('No active request templates available. Please contact HR.');
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template: RequestTemplate) => {
    setSelectedTemplate(template);
    const initialData: Record<string, any> = {};
    
    // Pre-fill date fields if preselectedDate is provided
    if (preselectedDate) {
      template.form_schema.forEach(field => {
        // Only auto-fill START/FROM date fields and single 'date' field
        // Do NOT auto-fill end/to dates - let user choose if they want a range
        if (
          field.type === 'date' &&
          (field.name === 'start_date' ||
           field.name === 'from_date' ||
           field.name === 'date')
        ) {
          initialData[field.name] = preselectedDate;
        }
      });
    }
    
    setFormData(initialData);
    setError(null);
    setUseColClaim(false);
  };

  // Auto-uncheck COL claim if dates change and become invalid
  useEffect(() => {
    if (!selectedTemplate || !useColClaim || !colInfo) return;
    
    // Get earliest date from form
    let earliestRequestDate: string | null = null;
    selectedTemplate.form_schema.forEach(field => {
      if ((field.type === 'date' || field.name.includes('date')) && formData[field.name]) {
        const dateVal = formData[field.name];
        if (!earliestRequestDate || dateVal < earliestRequestDate) {
          earliestRequestDate = dateVal;
        }
      }
    });

    // Check if still valid
    if (earliestRequestDate && colInfo.earned_dates && colInfo.earned_dates.length > 0) {
      const latestEarnedDate = colInfo.earned_dates[0]?.date;
      if (earliestRequestDate <= latestEarnedDate) {
        // Dates are now invalid, uncheck
        setUseColClaim(false);
      }
    }
  }, [formData, selectedTemplate, colInfo, useColClaim]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTemplate) {
      setError('Please select a request type');
      return;
    }

    // Validate required fields
    const missingFields: string[] = [];
    selectedTemplate.form_schema.forEach(field => {
      if (field.required && !formData[field.name]) {
        missingFields.push(field.label);
      }
    });

    if (missingFields.length > 0) {
      setError(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        template_id: selectedTemplate.id!,
        form_data: { ...formData }
      } as any;

      if (useColClaim) payload.form_data.claim_col = true;

      await createRequest(payload);
      if (onCreated) onCreated();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Submit New Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-600">Loading request types...</div>
          ) : error && templates.length === 0 ? (
            <div className="text-center py-8">
              <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                {error}
              </div>
            </div>
          ) : (
            <>
              {/* Filter Message */}
              {filterMessage && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
                  ℹ️ {filterMessage}
                </div>
              )}
              
              {/* Step 1: Select Template */}
              {!selectedTemplate ? (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Step 1: Select Request Type
                  </h3>
                  {templates.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">
                      {filterMessage || 'No templates available for the selected date.'}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all"
                        >
                          <h4 className="font-semibold text-gray-900 mb-1">{template.name}</h4>
                          <p className="text-sm text-gray-600 mb-2">
                            {template.description || 'No description'}
                          </p>
                          <div className="flex gap-4 text-xs text-gray-500">
                            <span>{template.form_schema.length} fields to fill</span>
                            <span>{template.total_steps || 0} approval steps</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Step 2: Fill Form */
                <form onSubmit={handleSubmit}>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Step 2: Fill in Details
                      </h3>
                      <p className="text-sm text-gray-600">{selectedTemplate.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTemplate(null);
                        setFormData({});
                        setError(null);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Change Type
                    </button>
                  </div>

                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <DynamicFormRenderer
                    fields={selectedTemplate.form_schema}
                    values={formData}
                    onChange={setFormData}
                  />

                  {/* Claim COL option for deduct templates (Casual Leave) */}
                  {selectedTemplate.leave_policy && 
                   selectedTemplate.leave_policy.action === 'deduct' && 
                   colInfo && 
                   colInfo.col_balance > 0 && (
                    <div>
                      {(() => {
                        // Check if form has date fields filled
                        const hasDateFields = selectedTemplate.form_schema.some(f => 
                          (f.type === 'date' || f.name.includes('date')) && formData[f.name]
                        );
                        
                        // Get the earliest date from form
                        let earliestRequestDate: string | null = null;
                        selectedTemplate.form_schema.forEach(field => {
                          if ((field.type === 'date' || field.name.includes('date')) && formData[field.name]) {
                            const dateVal = formData[field.name];
                            if (!earliestRequestDate || dateVal < earliestRequestDate) {
                              earliestRequestDate = dateVal;
                            }
                          }
                        });

                        // Check if request date is after COL earned dates
                        let canClaim = true;
                        let warningMsg = '';
                        
                        if (earliestRequestDate && colInfo.earned_dates && colInfo.earned_dates.length > 0) {
                          const latestEarnedDate = colInfo.earned_dates[0]?.date; // Already sorted desc in backend
                          if (earliestRequestDate <= latestEarnedDate) {
                            canClaim = false;
                            warningMsg = `Cannot claim COL for dates on or before ${latestEarnedDate} (last COL earned)`;
                          }
                        }

                        // Show checkbox only if has date fields
                        if (!hasDateFields) {
                          return null;
                        }

                        return (
                          <div className="mt-4 space-y-2">
                            <div className={`p-3 border rounded flex items-start gap-3 ${canClaim ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                              {canClaim ? (
                                <>
                                  <input 
                                    id="claim_col" 
                                    type="checkbox" 
                                    checked={useColClaim} 
                                    onChange={e => setUseColClaim(e.target.checked)}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1">
                                    <label htmlFor="claim_col" className="text-sm font-medium text-green-800 cursor-pointer">
                                      ✓ Claim Compensatory Off Leave (COL)
                                    </label>
                                    <p className="text-xs text-green-700 mt-1">
                                      Available COL balance: <strong>{colInfo.col_balance}</strong> days
                                      {colInfo.earned_dates && colInfo.earned_dates.length > 0 && (
                                        <> · Last earned: {new Date(colInfo.earned_dates[0].date).toLocaleDateString()}</>
                                      )}
                                    </p>
                                  </div>
                                </>
                              ) : (
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-yellow-800">⚠️ COL Not Claimable</p>
                                  <p className="text-xs text-yellow-700 mt-1">
                                    {warningMsg}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Approval Workflow Preview */}
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-900 mb-2">
                      Approval Workflow
                    </h4>
                    <p className="text-sm text-blue-800">
                      Your request will be reviewed by:{' '}
                      {selectedTemplate.approval_steps
                        ?.map(step => step.approver_role)
                        .join(' → ') || 'Approval steps not configured'}
                    </p>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {selectedTemplate && (
          <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
