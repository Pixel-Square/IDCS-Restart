import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Eye } from 'lucide-react';
import { getTemplates, deleteTemplate, patchTemplate } from '../../services/staffRequests';
import type { RequestTemplate } from '../../types/staffRequests';
import TemplateEditorModal from './TemplateEditorModal';

export default function TemplateManagementPage() {
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RequestTemplate | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleCreate = () => {
    setEditingTemplate(null);
    setShowEditor(true);
  };

  const handleEdit = (template: RequestTemplate) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await deleteTemplate(id);
      setTemplates(templates.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete template');
    }
  };

  const handleToggleActive = async (template: RequestTemplate) => {
    try {
      const updated = await patchTemplate(template.id!, { is_active: !template.is_active });
      setTemplates(templates.map(t => t.id === updated.id ? updated : t));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update template');
    }
  };

  const handleSaved = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    loadTemplates();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Request Templates</h2>
              <p className="text-sm text-gray-600 mt-1">
                Create and manage dynamic forms for staff requests (Leaves, ODs, Permissions)
              </p>
            </div>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Create Template
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Templates List */}
        <div className="p-6">
          {templates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-4">No templates created yet.</p>
              <button
                onClick={handleCreate}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Create your first template
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {template.name}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            template.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {template.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        {template.description || 'No description'}
                      </p>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                        <div>
                          <span className="font-medium">Form Fields:</span> {template.form_schema?.length || 0}
                        </div>
                        <div>
                          <span className="font-medium">Approval Steps:</span> {template.total_steps || 0}
                        </div>
                        <div>
                          <span className="font-medium">Allowed Roles:</span>{' '}
                          {template.allowed_roles?.length > 0
                            ? template.allowed_roles.join(', ')
                            : 'All'}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleToggleActive(template)}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                        title={template.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {template.is_active ? (
                          <ToggleRight size={20} className="text-green-600" />
                        ) : (
                          <ToggleLeft size={20} />
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(template)}
                        className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id!)}
                        className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template Editor Modal */}
      {showEditor && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => {
            setShowEditor(false);
            setEditingTemplate(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
