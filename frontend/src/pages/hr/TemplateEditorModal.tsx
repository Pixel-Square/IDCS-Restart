import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { createTemplate, updateTemplate } from '../../services/staffRequests';
import type { RequestTemplate, FormField, ApprovalStep } from '../../types/staffRequests';
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
  { value: 'select', label: 'Dropdown' }
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
  const [activeTab, setActiveTab] = useState<'details' | 'fields' | 'workflow'>('details');
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);

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
        is_active: isActive,
        form_schema: formFields,
        allowed_roles: allowedRoles.length > 0 ? allowedRoles : [],
        approval_steps: approvalSteps as ApprovalStep[]
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
