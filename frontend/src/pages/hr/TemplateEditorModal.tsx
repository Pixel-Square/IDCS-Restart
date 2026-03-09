import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { createTemplate, updateTemplate } from '../../services/staffRequests';
import type { RequestTemplate, FormField, ApprovalStep, LeavePolicy, AttendanceAction } from '../../types/staffRequests';
import { fetchRoles } from '../../services/accounts';

interface Props {
  template: RequestTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'select', label: 'Dropdown' },
  { value: 'file', label: 'File Upload' }
];

// fallback roles while dashboard is loading
const FALLBACK_ROLES = ['FACULTY', 'STAFF', 'HOD', 'AHOD'];

export default function TemplateEditorModal({ template, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [approvalSteps, setApprovalSteps] = useState<Partial<ApprovalStep>[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'fields' | 'workflow' | 'attendance'>('details');
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [leavePolicy, setLeavePolicy] = useState<LeavePolicy>({});
  const [attendanceAction, setAttendanceAction] = useState<AttendanceAction>({});

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description);
      setIsActive(template.is_active);
      setAllowedRoles(template.allowed_roles || []);
      setFormFields(template.form_schema || []);
      setApprovalSteps(
        (template.approval_steps || []).map(step => ({
          step_order: step.step_order,
          approver_role: step.approver_role
        }))
      );
      setAttendanceAction(template.attendance_action || {});
      setLeavePolicy(template.leave_policy || {});
    }
  }, [template]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setRolesLoading(true);
      setRolesError(null);
      try {
        const list = await fetchRoles();
        if (!mounted) return;
        const filtered = list.filter((x) => String(x || '').toUpperCase() !== 'STUDENT');
        const uniq = Array.from(new Set(filtered.map((x) => String(x || '').toUpperCase()))).sort();
        setRoles(uniq);
      } catch (e: any) {
        if (!mounted) return;
        setRolesError((e && e.message) || 'Failed to load roles');
      } finally {
        if (mounted) setRolesLoading(false);
      }
    };
    load();
    return () => { mounted = false };
  }, []);

  const handleAddField = () => {
    setFormFields([
      ...formFields,
      { name: '', type: 'text', label: '', required: false }
    ]);
  };

  const handleUpdateField = (index: number, field: Partial<FormField>) => {
    const updated = [...formFields];
    updated[index] = { ...updated[index], ...field };
    setFormFields(updated);
  };

  const handleRemoveField = (index: number) => {
    setFormFields(formFields.filter((_, i) => i !== index));
  };

  const handleAddStep = () => {
    const nextOrder = approvalSteps.length + 1;
    setApprovalSteps([...approvalSteps, { step_order: nextOrder, approver_role: '' }]);
  };

  const handleUpdateStep = (index: number, step: Partial<ApprovalStep>) => {
    const updated = [...approvalSteps];
    updated[index] = { ...updated[index], ...step };
    setApprovalSteps(updated);
  };

  const handleRemoveStep = (index: number) => {
    const updated = approvalSteps.filter((_, i) => i !== index);
    // Re-number steps
    updated.forEach((step, i) => {
      step.step_order = i + 1;
    });
    setApprovalSteps(updated);
  };

  const toggleRole = (role: string) => {
    if (allowedRoles.includes(role)) {
      setAllowedRoles(allowedRoles.filter(r => r !== role));
    } else {
      setAllowedRoles([...allowedRoles, role]);
    }
  };

  const handleLeavePolicyChange = (updates: Partial<LeavePolicy>) => {
    setLeavePolicy(prev => ({ ...prev, ...updates }));
  };

  const handleAttendanceActionChange = (updates: Partial<AttendanceAction>) => {
    setAttendanceAction(prev => ({ ...prev, ...updates }));
  };
  const handleAllotmentChange = (role: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setLeavePolicy(prev => ({
      ...prev,
      allotment_per_role: {
        ...prev.allotment_per_role,
        [role]: numValue
      }
    }));
  };

  const removeAllotmentRole = (role: string) => {
    setLeavePolicy(prev => {
      const updated = { ...prev };
      if (updated.allotment_per_role) {
        const newAllotment = { ...updated.allotment_per_role };
        delete newAllotment[role];
        updated.allotment_per_role = newAllotment;
      }
      return updated;
    });
  };

  const validateForm = (): string | null => {
    if (!name.trim()) return 'Template name is required';
    if (formFields.length === 0) return 'At least one form field is required';
    
    for (const field of formFields) {
      if (!field.name.trim()) return 'All fields must have a name';
      if (!field.label.trim()) return 'All fields must have a label';
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        return `Dropdown field "${field.label}" must have options`;
      }
    }
    
    if (approvalSteps.length === 0) return 'At least one approval step is required';
    
    for (const step of approvalSteps) {
      if (!step.approver_role) return 'All approval steps must have a role assigned';
    }
    
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: Partial<RequestTemplate> = {
        name,
        description,
        attendance_action: attendanceAction.change_status ? attendanceAction : {},
        is_active: isActive,
        form_schema: formFields,
        allowed_roles: allowedRoles.length > 0 ? allowedRoles : [],
        approval_steps: approvalSteps as ApprovalStep[],
        leave_policy: (leavePolicy.action || leavePolicy.allotment_per_role || leavePolicy.attendance_status) ? leavePolicy : {}
      };

      if (template?.id) {
        await updateTemplate(template.id, payload);
      } else {
        await createTemplate(payload);
      }

      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">
            {template ? 'Edit Template' : 'Create New Template'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                activeTab === 'details'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Details
            </button>

            <button
              onClick={() => setActiveTab('fields')}
              className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                activeTab === 'fields'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Form Fields ({formFields.length})
            </button>

            <button
              onClick={() => setActiveTab('workflow')}
              className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                activeTab === 'workflow'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Approval Workflow ({approvalSteps.length})
            </button>

            <button
              onClick={() => setActiveTab('attendance')}
              className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                activeTab === 'attendance'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Attendance Action
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'details' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Leave Request, OD Request"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this request type"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Active (users can submit this request type)
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Allowed Roles (leave empty to allow all staff)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(rolesLoading ? FALLBACK_ROLES : (roles.length ? roles : FALLBACK_ROLES)).map(role => (
                    <label key={role} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowedRoles.includes(role)}
                        onChange={() => toggleRole(role)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{role}</span>
                    </label>
                  ))}
                </div>
                {rolesError && (
                  <div className="mt-2 text-xs text-red-600">Failed to load roles: {rolesError}</div>
                )}
              </div>

              {/* Leave & Attendance Settings */}
              <div className="border-t pt-6 mt-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Leave & Attendance Settings</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Action Type
                    </label>
                    <select
                      value={leavePolicy.action || ''}
                      onChange={(e) => {
                        const action = e.target.value as LeavePolicy['action'] | '';
                        if (action) {
                          handleLeavePolicyChange({ 
                            action,
                            overdraft_name: action === 'deduct' ? (leavePolicy.overdraft_name || 'LOP') : undefined,
                            reset_duration: action === 'deduct' ? (leavePolicy.reset_duration || 'yearly') : undefined
                          });
                        } else {
                          setLeavePolicy({});
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">None (No leave tracking)</option>
                      <option value="deduct">Deduct (Consumes leave balance)</option>
                      <option value="earn">Earn (Adds to leave balance)</option>
                      <option value="neutral">Neutral (No balance changes)</option>
                    </select>
                  </div>

                  {leavePolicy.action && (
                    <>
                      {leavePolicy.action === 'deduct' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Allotment per Role
                            </label>
                            <p className="text-xs text-gray-500 mb-3">
                              Set the initial leave balance for each role. Staff will get this balance when first tracked.
                            </p>
                            <div className="space-y-2">
                              {Object.entries(leavePolicy.allotment_per_role || {}).map(([role, days]) => (
                                <div key={role} className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-24">{role}:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={days}
                                    onChange={(e) => handleAllotmentChange(role, e.target.value)}
                                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-500 w-12">days</span>
                                  <button
                                    onClick={() => removeAllotmentRole(role)}
                                    className="text-red-600 hover:text-red-700 p-1"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAllotmentChange(e.target.value, '0');
                                  }
                                }}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">+ Add role...</option>
                                {(rolesLoading ? FALLBACK_ROLES : (roles.length ? roles : FALLBACK_ROLES))
                                  .filter(role => !leavePolicy.allotment_per_role?.[role])
                                  .map(role => (
                                    <option key={role} value={role}>{role}</option>
                                  ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Reset Duration
                            </label>
                            <select
                              value={leavePolicy.reset_duration || 'yearly'}
                              onChange={(e) => handleLeavePolicyChange({ reset_duration: e.target.value as 'yearly' | 'monthly' })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="yearly">Yearly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Overdraft Field Name
                            </label>
                            <input
                              type="text"
                              value={leavePolicy.overdraft_name || 'LOP'}
                              onChange={(e) => handleLeavePolicyChange({ overdraft_name: e.target.value })}
                              placeholder="LOP"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              If staff exceed their allotment, this field will count the extra days.
                            </p>
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Attendance Status Code
                        </label>
                        <input
                          type="text"
                          value={leavePolicy.attendance_status || ''}
                          onChange={(e) => handleLeavePolicyChange({ attendance_status: e.target.value })}
                          placeholder="e.g., CL, COL, OD"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          The exact code to mark in the attendance register upon approval.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fields' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-600">
                  Define the input fields that staff will fill when submitting this request
                </p>
                <button
                  onClick={handleAddField}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  <Plus size={16} />
                  Add Field
                </button>
              </div>

              {formFields.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No fields added yet. Click "Add Field" to start building your form.
                </div>
              ) : (
                <div className="space-y-4">
                  {formFields.map((field, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Field Name (internal) *
                          </label>
                          <input
                            type="text"
                            value={field.name}
                            onChange={(e) => handleUpdateField(index, { name: e.target.value })}
                            placeholder="e.g., from_date"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Field Type *
                          </label>
                          <select
                            value={field.type}
                            onChange={(e) => handleUpdateField(index, { 
                              type: e.target.value as FormField['type'],
                              options: e.target.value === 'select' ? [''] : undefined
                            })}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          >
                            {FIELD_TYPES.map(ft => (
                              <option key={ft.value} value={ft.value}>{ft.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Label (shown to users) *
                        </label>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => handleUpdateField(index, { label: e.target.value })}
                          placeholder="e.g., From Date"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      {field.type === 'select' && (
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Options (one per line)
                          </label>
                          <textarea
                            value={(field.options || []).join('\n')}
                            onChange={(e) => handleUpdateField(index, { 
                              options: e.target.value.split('\n').filter(o => o.trim())
                            })}
                            placeholder="Casual Leave&#10;Sick Leave&#10;Earned Leave"
                            rows={3}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}

                      {field.type === 'file' && (
                        <div className="mb-3 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Max File Size (MB)
                            </label>
                            <input
                              type="number"
                              value={field.max_size_mb || 10}
                              onChange={(e) => handleUpdateField(index, { 
                                max_size_mb: parseFloat(e.target.value) || 10
                              })}
                              min="1"
                              max="100"
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Allowed File Extensions (comma-separated)
                            </label>
                            <input
                              type="text"
                              value={(field.allowed_extensions || []).join(', ')}
                              onChange={(e) => handleUpdateField(index, { 
                                allowed_extensions: e.target.value.split(',').map(ext => ext.trim()).filter(ext => ext)
                              })}
                              placeholder=".pdf, .docx, .jpg, .png"
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Leave empty to allow all file types
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => handleUpdateField(index, { required: e.target.checked })}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-xs text-gray-700">Required field</span>
                        </label>
                        <button
                          onClick={() => handleRemoveField(index)}
                          className="text-red-600 hover:text-red-700 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'workflow' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-600">
                  Define the sequential approval hierarchy for this request type
                </p>
                <button
                  onClick={handleAddStep}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  <Plus size={16} />
                  Add Step
                </button>
              </div>

              {approvalSteps.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No approval steps defined. Click "Add Step" to create the workflow.
                </div>
              ) : (
                <div className="space-y-3">
                  {approvalSteps.map((step, index) => (
                    <div key={index} className="flex items-center gap-3 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <GripVertical size={16} className="text-gray-400" />
                        <span className="font-semibold text-gray-700">Step {step.step_order}</span>
                      </div>
                      <div className="flex-1">
                        <select
                          value={step.approver_role}
                          onChange={(e) => handleUpdateStep(index, { approver_role: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select approver role...</option>
                          {(rolesLoading ? FALLBACK_ROLES : (roles.length ? roles : FALLBACK_ROLES)).map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => handleRemoveStep(index)}
                        className="text-red-600 hover:text-red-700 p-2"
                      >
                        <Trash2 size={18} />

          {activeTab === 'attendance' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900">
                  Configure automatic attendance status changes when a request is approved.
                  Useful for permissions that should mark absent days as present (e.g., Late Entry Permission).
                </p>
              </div>

              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={attendanceAction.change_status || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleAttendanceActionChange({ 
                          change_status: true,
                          from_status: 'absent',
                          to_status: 'present',
                          apply_to_dates: [],
                          date_format: 'YYYY-MM-DD',
                          add_notes: false
                        });
                      } else {
                        setAttendanceAction({});
                      }
                    }}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-base font-semibold text-gray-900">
                    Change attendance status on approval
                  </span>
                </label>
              </div>

              {attendanceAction.change_status && (
                <div className="space-y-4 pl-8 border-l-2 border-gray-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        From Status *
                      </label>
                      <input
                        type="text"
                        value={attendanceAction.from_status || ''}
                        onChange={(e) => handleAttendanceActionChange({ from_status: e.target.value })}
                        placeholder="e.g., absent"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Attendance records with this status will be updated
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        To Status *
                      </label>
                      <input
                        type="text"
                        value={attendanceAction.to_status || ''}
                        onChange={(e) => handleAttendanceActionChange({ to_status: e.target.value })}
                        placeholder="e.g., present"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        New status to set when request is approved
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Apply to Date Fields *
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Select which form fields contain dates that should have their attendance updated.
                      For date range requests, select both start and end date fields.
                    </p>
                    <div className="space-y-2">
                      {formFields.filter(f => f.type === 'date').length === 0 ? (
                        <div className="text-sm text-gray-500 italic">
                          No date fields defined. Add date fields in the "Form Fields" tab first.
                        </div>
                      ) : (
                        formFields
                          .filter(f => f.type === 'date')
                          .map((field) => (
                            <label key={field.name} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(attendanceAction.apply_to_dates || []).includes(field.name)}
                                onChange={(e) => {
                                  const current = attendanceAction.apply_to_dates || [];
                                  if (e.target.checked) {
                                    handleAttendanceActionChange({ 
                                      apply_to_dates: [...current, field.name] 
                                    });
                                  } else {
                                    handleAttendanceActionChange({ 
                                      apply_to_dates: current.filter(f => f !== field.name) 
                                    });
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">{field.label} ({field.name})</span>
                            </label>
                          ))
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={attendanceAction.add_notes || false}
                        onChange={(e) => handleAttendanceActionChange({ add_notes: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Add notes to attendance record
                      </span>
                    </label>

                    {attendanceAction.add_notes && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Notes Template
                        </label>
                        <textarea
                          value={attendanceAction.notes_template || ''}
                          onChange={(e) => handleAttendanceActionChange({ notes_template: e.target.value })}
                          placeholder="e.g., Late Entry Permission: {shift} shift, {late_duration} mins late"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Use {'{field_name}'} to insert values from the form. Example: {'{reason}'}, {'{shift}'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-900">
                      <strong>Preview:</strong> When this request is approved, attendance records with status "{attendanceAction.from_status}" 
                      will be changed to "{attendanceAction.to_status}" for dates from: {
                        (attendanceAction.apply_to_dates || []).length > 0 
                          ? (attendanceAction.apply_to_dates || []).join(', ')
                          : 'None selected'
                      }
                      {attendanceAction.add_notes && ' (with notes)'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Workflow Preview:</strong> When a request is submitted, it will go through{' '}
                  {approvalSteps.length} step(s) in order:{' '}
                  {approvalSteps.map(s => s.approver_role).filter(Boolean).join(' → ') || 'None'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
