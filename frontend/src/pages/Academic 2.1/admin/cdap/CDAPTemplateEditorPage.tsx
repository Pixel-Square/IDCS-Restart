import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Save, Plus, ArrowLeft, Layers } from 'lucide-react';
import { CdapTemplate, createEmptyCdapTemplate, fetchCdapTemplate, saveCdapTemplate, buildTemplateKey } from '../../../../services/cdapAdmin';

function parseAliases(input: string) {
  return input
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

export default function CDAPTemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = templateId === 'new' || location.pathname.endsWith('/new');

  const [template, setTemplate] = useState<CdapTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (isNew) {
          setTemplate(createEmptyCdapTemplate());
        } else if (templateId) {
          const data = await fetchCdapTemplate(templateId);
          setTemplate(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load template');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isNew, templateId]);

  const setField = (index: number, field: Partial<keyof CdapTemplate['fieldDefinitions'][number]>, value: string | string[] | number | boolean) => {
    setTemplate((current) => {
      if (!current) return current;
      const updatedFields = [...current.fieldDefinitions];
      updatedFields[index] = {
        ...updatedFields[index],
        [field as string]: value,
      } as any;
      return { ...current, fieldDefinitions: updatedFields };
    });
  };

  const addRow = () => {
    setTemplate((current) => {
      if (!current) return current;
      return {
        ...current,
        fieldDefinitions: [
          ...current.fieldDefinitions,
          { fieldCode: '', displayHeader: '', excelColumn: '', aliases: [] },
        ],
      };
    });
  };

  const sampleRows = useMemo(() => {
    if (!template) return [] as string[];
    return template.fieldDefinitions.map((field) => {
      const column = field.excelColumn || 'A';
      const rowBase = template.headerRowLine + 1;
      return `${column}${rowBase}, ${column}${rowBase + 1}, ${column}${rowBase + 2}`;
    });
  }, [template]);

  const save = async () => {
    if (!template) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const normalizedName = String(template.name || '').trim();
      if (!normalizedName) {
        throw new Error('Template name is required.');
      }
      const payload: CdapTemplate = {
        ...template,
        name: normalizedName,
        key: buildTemplateKey(normalizedName) || template.key || 'cdap-template',
        fieldDefinitions: template.fieldDefinitions.map((field) => ({
          ...field,
          aliases: Array.isArray(field.aliases) ? field.aliases : parseAliases(String(field.aliases || '')),
        })),
      };

      const saved = await saveCdapTemplate(payload);
      setTemplate(saved);
      setMessage('Template saved successfully.');
      if (isNew) {
        navigate(`/academic-v2/admin/cdap-templates/${saved.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !template) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-10">
        <div className="max-w-5xl mx-auto rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Loading template editor…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-blue-600">Academic 2.1 Admin</p>
            <h1 className="text-4xl font-semibold text-slate-900">CDAP Template Editor</h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              Configure the Excel mapping, sample coordinates, and alias matching for each import field.
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Template Name</label>
                <input
                  type="text"
                  value={template.name}
                  onChange={(event) => setTemplate({ ...template, name: event.target.value })}
                  placeholder="E.g. CDAP KRU Batch - July"
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Template Key</label>
                  <input
                    type="text"
                    value={template.key}
                    onChange={(event) => setTemplate({ ...template, key: event.target.value })}
                    placeholder="cdap-template-july"
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Header Row Line</label>
                  <input
                    type="number"
                    min={1}
                    value={template.headerRowLine}
                    onChange={(event) => setTemplate({ ...template, headerRowLine: Number(event.target.value) })}
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Excel Sheet / Tab Number</label>
                  <input
                    type="number"
                    min={1}
                    value={template.sheetNumber}
                    onChange={(event) => setTemplate({ ...template, sheetNumber: Number(event.target.value) })}
                    placeholder="1"
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Field mapping</h2>
                    <p className="text-sm text-slate-500">Each row defines how a CDAP column maps to a system field.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add field
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                    <thead className="bg-white text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Field Code</th>
                        <th className="px-4 py-3 text-left font-semibold">Display Header</th>
                        <th className="px-4 py-3 text-left font-semibold">Excel Column</th>
                        <th className="px-4 py-3 text-left font-semibold">Aliases</th>
                        <th className="px-4 py-3 text-left font-semibold">Sample</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-slate-50">
                      {template.fieldDefinitions.map((field, index) => (
                        <tr key={`${field.fieldCode}-${index}`} className="hover:bg-white transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={field.fieldCode}
                              onChange={(event) => setField(index, 'fieldCode', event.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={field.displayHeader}
                              onChange={(event) => setField(index, 'displayHeader', event.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={field.excelColumn}
                              onChange={(event) => setField(index, 'excelColumn', event.target.value.toUpperCase())}
                              placeholder="A"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={field.aliases.join(', ')}
                              onChange={(event) => setField(index, 'aliases', parseAliases(event.target.value))}
                              placeholder="name, student"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {sampleRows[index]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
              ) : message ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center gap-3 text-slate-700 mb-4">
                <Layers className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Template preview</h2>
              </div>
              <div className="space-y-4 text-sm text-slate-600">
                <div>
                  <p className="font-semibold text-slate-900">Active matching</p>
                  <p>Use aliases to capture Excel column variations for each field.</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Excel sample mapping</p>
                  <p>The editor generates example coordinates based on the selected header row line.</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Quick note</p>
                  <p>If you need to support a new CDAP layout, add a new field row and update the aliases with the expected Excel header strings.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
