import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { UploadCloud, FileText, Sparkles, CheckCircle2 } from 'lucide-react';
import { fetchCdapTemplates, CdapTemplate } from '../../../services/cdapAdmin';

const emptyStatus = 'No file selected yet';

function normalizeHeader(value: any) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();
}

function excelColumnToIndex(column: string) {
  const value = String(column || '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(value)) return null;

  let index = 0;
  for (let i = 0; i < value.length; i += 1) {
    index = index * 26 + (value.charCodeAt(i) - 65 + 1);
  }
  return index - 1;
}

function buildFieldMap(headerRow: string[], template: CdapTemplate) {
  const mapping: Record<number, string> = {};
  const usedColumns = new Set<number>();
  const normalizedHeaders = headerRow.map((value) => normalizeHeader(value));

  template.fieldDefinitions.forEach((field) => {
    if (field.excelColumn) {
      const index = excelColumnToIndex(field.excelColumn);
      if (index !== null) {
        mapping[index] = field.fieldCode;
        usedColumns.add(index);
      }
    }
  });

  template.fieldDefinitions.forEach((field) => {
    const candidates = [field.displayHeader, field.fieldCode, ...(field.aliases || [])]
      .map(normalizeHeader)
      .filter(Boolean);

    if (!candidates.length) return;

    for (let colIndex = 0; colIndex < normalizedHeaders.length; colIndex += 1) {
      if (usedColumns.has(colIndex)) continue;
      const headerValue = normalizedHeaders[colIndex];
      if (!headerValue) continue;
      if (candidates.includes(headerValue)) {
        mapping[colIndex] = field.fieldCode;
        usedColumns.add(colIndex);
        break;
      }
    }
  });

  return mapping;
}

function applyForwardFill(rows: any[][], columns: number[]) {
  const lastValues: Record<number, any> = {};
  return rows.map((row) => {
    const nextRow = [...row];
    columns.forEach((col) => {
      const value = nextRow[col];
      if (value === '' || value === null || value === undefined) {
        if (col in lastValues) {
          nextRow[col] = lastValues[col];
        }
      } else {
        lastValues[col] = value;
      }
    });
    return nextRow;
  });
}

function rowHasValues(row: any[], columns: number[]) {
  return columns.some((col) => {
    const value = row[col];
    return value !== '' && value !== null && value !== undefined;
  });
}

export default function LearnerCentricApproachPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const courseName = courseId || '';
  const [template, setTemplate] = useState<CdapTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(emptyStatus);
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([]);
  const [fieldMap, setFieldMap] = useState<Record<number, string>>({});
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplate(true);
      try {
        const templates = await fetchCdapTemplates();
        setTemplate(templates.find((item) => item.isActive) || templates[0] || null);
      } catch (err) {
        setStatus('Unable to load CDAP templates.');
      } finally {
        setLoadingTemplate(false);
      }
    };

    loadTemplates();
  }, []);

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      await uploadFile(file);
    }
  };

  const handleSelectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    if (!template) {
      setStatus('No active CDAP template is available for parsing.');
      return;
    }

    setUploading(true);
    setStatus('Parsing file…');
    setParsedRows([]);
    setFieldMap({});

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellText: true });
      const sheetIndex = Math.max(0, (template.sheetNumber || 1) - 1);
      const sheetName = Array.isArray(workbook.SheetNames) && workbook.SheetNames.length > sheetIndex ? workbook.SheetNames[sheetIndex] : null;
      if (!sheetName) {
        throw new Error(`Sheet #${template.sheetNumber || 1} not found in the uploaded file. The file contains ${Array.isArray(workbook.SheetNames) ? workbook.SheetNames.length : 0} sheet(s).`);
      }
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: true }) as any[][];
      if (!rows.length) {
        throw new Error('The uploaded Excel file contains no rows.');
      }

      const headerIndex = Math.max(0, template.headerRowLine - 1);
      const headerRow = rows[headerIndex] ? rows[headerIndex].map((cell) => String(cell ?? '')) : rows[0].map((cell) => String(cell ?? ''));
      const mapping = buildFieldMap(headerRow, template);
      const mappedColumns = Object.keys(mapping).map((key) => Number(key));

      if (!mappedColumns.length) {
        throw new Error('Could not match any template fields to the Excel header row. Update the template aliases or column labels and try again.');
      }

      const dataRows = rows.slice(headerIndex + 1);
      const filledRows = applyForwardFill(dataRows, mappedColumns);
      const parsed = filledRows
        .filter((row) => rowHasValues(row, mappedColumns))
        .map((row) => {
          const normalized: Record<string, string> = {};
          template.fieldDefinitions.forEach((field) => {
            normalized[field.fieldCode] = '';
          });
          mappedColumns.forEach((colIndex) => {
            const fieldCode = mapping[colIndex];
            normalized[fieldCode] = String(row[colIndex] ?? '').trim();
          });
          return normalized;
        });

      if (!parsed.length) {
        setStatus('No data rows were found after the header row. Check the file and template settings.');
      } else {
        setStatus('File parsed successfully. Review the imported rows below.');
      }
      setFieldMap(mapping);
      setParsedRows(parsed);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to parse the selected file.');
      setParsedRows([]);
      setFieldMap({});
    } finally {
      setUploading(false);
    }
  };

  const renderTemplatePreview = () => {
    if (!template) {
      return (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
          <Sparkles className="mx-auto mb-4 h-10 w-10 text-slate-400" />
          <p className="text-lg font-semibold text-slate-900">Learner centric template not configured</p>
          <p className="mt-2 text-sm text-slate-500">Ask your IQAC administrator to create or activate a CDAP template in the admin settings.</p>
        </div>
      );
    }

    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Active CDAP template</h2>
            <p className="mt-1 text-sm text-slate-500">{template.name}</p>
          </div>
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {template.fieldDefinitions.length} fields
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {template.fieldDefinitions.slice(0, 6).map((field) => (
            <div key={field.fieldCode + field.excelColumn} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{field.displayHeader || field.fieldCode}</p>
              <p className="mt-2 text-sm text-slate-600">Column: <strong>{field.excelColumn || '—'}</strong></p>
              <p className="mt-1 text-sm text-slate-600">Aliases: {field.aliases.join(', ') || 'none'}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-blue-600">Learner Centric Approach</p>
              <h1 className="text-4xl font-semibold text-slate-900">Faculty CDAP Upload</h1>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                Upload an Excel file using the configured CDAP template and review the parsed learner-centric entries.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm">
              <p className="text-sm text-slate-500">Course</p>
              <p className="text-lg font-semibold text-slate-900">{courseName || courseId}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.8fr_0.6fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={handleDrop}
              className={`rounded-3xl border-2 transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-dashed border-slate-300 bg-slate-50'} p-10 text-center`}
            >
              <UploadCloud className="mx-auto mb-4 h-12 w-12 text-blue-600" />
              <p className="text-lg font-semibold text-slate-900">Drag & drop your CDAP file here</p>
              <p className="mt-2 text-sm text-slate-500">Or choose a file to upload for parsing.</p>
              <div className="mt-6 inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <label className="cursor-pointer">
                  Choose file
                  <input type="file" accept=".xlsx,.xls" onChange={handleSelectFile} className="sr-only" />
                </label>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-700">Upload status</p>
              <p className="mt-2 text-sm text-slate-600">{uploading ? 'Parsing file…' : status}</p>
            </div>

            {parsedRows.length > 0 ? (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3 text-slate-700 mb-4">
                  <FileText className="h-5 w-5" />
                  <h2 className="text-lg font-semibold text-slate-900">Parsed CDAP rows</h2>
                </div>
                <p className="text-sm text-slate-500">The uploaded file was parsed into the template layout defined by the admin.</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            {renderTemplatePreview()}
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex items-center gap-3 text-slate-700 mb-4">
                <Sparkles className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Instructions</h2>
              </div>
              <ul className="space-y-3 text-sm text-slate-600">
                <li>• Upload a file matching the active CDAP template layout.</li>
                <li>• Use aliases to handle Excel header variations across publishers.</li>
                <li>• Review the parsed revision below before saving.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {template ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    {template.fieldDefinitions.map((field) => (
                      <th key={field.fieldCode} className="px-4 py-3 text-left font-semibold">{field.displayHeader || field.fieldCode}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {parsedRows.length > 0 ? (
                    parsedRows.map((row, index) => (
                      <tr key={`${row[template.fieldDefinitions[0]?.fieldCode || 'row']}-${index}`} className="hover:bg-slate-50 transition-colors">
                        {template.fieldDefinitions.map((field) => (
                          <td key={`${field.fieldCode}-${index}`} className="px-4 py-3 align-top text-slate-600">
                            {row[field.fieldCode] || ''}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={template.fieldDefinitions.length} className="px-4 py-10 text-center text-slate-500">
                        No course data parsed yet. Upload a CDAP spreadsheet to populate this grid.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No active template is available yet. Please contact the admin to configure a CDAP template.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
