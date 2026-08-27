import React, { useState, useEffect } from 'react';
import type { ApprovedODForm, TravelExpenseRow, FoodExpenseRow, OtherExpenseRow } from '../../../types/eventAttending';
import type { MyEventBudget } from '../../../types/eventAttending';
import { submitEventForm } from '../../../services/eventAttending';
import { getActiveTemplates } from '../../../services/staffRequests';
import type { RequestTemplate } from '../../../types/staffRequests';
import DynamicFormRenderer from '../DynamicFormRenderer';
import ImageCropperModal from '../../../components/ImageCropperModal';
import { ChevronDown, ChevronUp, Plus, Trash2, Upload, CheckCircle, AlertTriangle, FileText, Link2, X, PartyPopper } from 'lucide-react';

interface Props {
  odForms: ApprovedODForm[];
  budget: MyEventBudget | null;
  onSubmitted: () => void;
}

const EMPTY_TRAVEL: TravelExpenseRow = { date: '', bill_no: '', mode_of_travel: '', from: '', to: '', amount: 0 };
const EMPTY_FOOD: FoodExpenseRow = { date: '', bill_no: '', breakfast: '', lunch: '', dinner: '', amount: 0 };
const EMPTY_OTHER: OtherExpenseRow = { s_no: 1, date: '', bill_no: '', expense_details: '', amount: 0 };

// Build a label map from form_schema: { fieldName -> label }
function buildLabelMap(schema: Array<{ name: string; label: string; [k: string]: any }>): Record<string, string> {
  const map: Record<string, string> = {
    kss_link: 'KSS Link'
  };
  schema.forEach(f => {
    map[f.name] = f.label || f.name.replace(/_/g, ' ');
    // Also map any conditional child fields
    if (f.conditional_fields) {
      Object.values(f.conditional_fields).forEach((children: any[]) => {
        children.forEach(cf => { map[cf.name] = cf.label || cf.name.replace(/_/g, ' '); });
      });
    }
  });
  return map;
}

// Flatten all values from form_data using the schema for ordering and labels.
// Skips file/proof fields and object values.
function getOrderedFormDataRows(
  formData: Record<string, any>,
  schema: Array<{ name: string; label: string; type: string; [k: string]: any }>
): Array<{ label: string; value: string }> {
  const labelMap = buildLabelMap(schema);
  const result: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();

  // Walk schema order first
  const walkSchema = (fields: Array<{ name: string; label: string; type: string; [k: string]: any }>) => {
    fields.forEach(field => {
      if (field.type === 'file') return;
      const val = formData[field.name];
      if (val != null && val !== '' && typeof val !== 'object') {
        result.push({ label: field.label || field.name.replace(/_/g, ' '), value: String(val) });
        seen.add(field.name);
      }
      // Check conditional children if the current value matches
      if (field.can_change_form_fields && field.conditional_fields && val) {
        const children = field.conditional_fields[String(val)] || [];
        walkSchema(children);
      }
    });
  };
  walkSchema(schema);

  // Append any extra keys in form_data not in schema
  Object.entries(formData).forEach(([k, v]) => {
    if (seen.has(k) || v == null || v === '' || typeof v === 'object') return;
    if (k === 'proof') return;
    result.push({ label: labelMap[k] || k.replace(/_/g, ' '), value: String(v) });
  });

  return result;
}

export default function ExpenseFormTab({ odForms, budget, onSubmitted }: Props) {
  const [formMode, setFormMode] = useState<'od' | 'manual'>('od');
  const [selectedOD, setSelectedOD] = useState<ApprovedODForm | null>(null);
  const [expandedOD, setExpandedOD] = useState<number | null>(null);
  const [odClaim, setOdClaim] = useState<'yes' | 'no'>('yes'); // for manual mode
  
  // Manual Event Details state
  const [eventDetails, setEventDetails] = useState<Record<string, any>>({});
  const [odTemplates, setOdTemplates] = useState<RequestTemplate[]>([]);
  const [selectedOdTemplateId, setSelectedOdTemplateId] = useState<number | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const templates = await getActiveTemplates();
        const odTmpls = templates.filter(t => t.name.startsWith('ON duty'));
        setOdTemplates(odTmpls);
        if (odTmpls.length > 0) {
          setSelectedOdTemplateId(odTmpls[0].id);
        }
      } catch (err) {
        console.error('Failed to load OD templates', err);
      }
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (formMode === 'od' && selectedOD) {
      const fd = selectedOD.form_data || {};
      let isFin = false;
      let isAdv = false;
      let amount = 0;
      let totalFeesAmount = 0;
      Object.entries(fd).forEach(([k, v]) => {
        const kl = String(k).toLowerCase();
        if (kl.includes('financial') && String(v).trim().toUpperCase() === 'YES') isFin = true;
        if (kl.includes('advance') && String(v).trim().toUpperCase() === 'YES') isAdv = true;
        if (kl.includes('proposed')) {
          const val = Number(v);
          if (!isNaN(val)) amount = val;
        }
        if (kl.includes('total_fees')) {
          const val = Number(v);
          if (!isNaN(val)) totalFeesAmount = val;
        }
      });
      if (isFin) {
        setFeesSpend(totalFeesAmount);
      } else {
        setFeesSpend(0);
      }
      if (isFin && isAdv) {
        setAdvanceAmount(amount);
      } else {
        setAdvanceAmount(0);
      }
    }
  }, [formMode, selectedOD]);

  const [travel, setTravel] = useState<TravelExpenseRow[]>([{ ...EMPTY_TRAVEL }]);
  const [food, setFood] = useState<FoodExpenseRow[]>([{ ...EMPTY_FOOD }]);
  const [other, setOther] = useState<OtherExpenseRow[]>([{ ...EMPTY_OTHER }]);
  const [feesSpend, setFeesSpend] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceDate, setAdvanceDate] = useState('');
  const [files, setFiles] = useState<Record<string, File>>({});
  const [orientations, setOrientations] = useState<Record<string, 'portrait' | 'landscape'>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [activeCropperFile, setActiveCropperFile] = useState<File | null>(null);
  const [activeCropperKey, setActiveCropperKey] = useState<string | null>(null);

  const travelTotal = travel.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const foodTotal = food.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const otherTotal = other.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const grandTotal = travelTotal + foodTotal + otherTotal + (Number(feesSpend) || 0);
  const balance = grandTotal - (Number(advanceAmount) || 0);

  const availableODs = odForms.filter(f => !f.has_event_form);

  const handleFileChange = (key: string, file: File | null) => {
    if (file) {
      setActiveCropperKey(key);
      setActiveCropperFile(file);
    } else { 
      const n = { ...files }; delete n[key]; setFiles(n); 
      const o = { ...orientations }; delete o[key]; setOrientations(o);
    }
  };

  const handleCropperSave = (croppedFile: File, orientation: 'portrait' | 'landscape') => {
    if (activeCropperKey) {
      setFiles(p => ({ ...p, [activeCropperKey]: croppedFile }));
      setOrientations(p => ({ ...p, [activeCropperKey]: orientation }));
    }
    setActiveCropperFile(null);
    setActiveCropperKey(null);
  };

  const isTravelEmpty = (r: TravelExpenseRow) => !r.date && !r.bill_no && !r.mode_of_travel && !r.from && !r.to && (!r.amount || Number(r.amount) === 0);
  const isFoodEmpty = (r: FoodExpenseRow) => !r.date && !r.bill_no && !r.breakfast && !r.lunch && !r.dinner && (!r.amount || Number(r.amount) === 0);
  const isOtherEmpty = (r: OtherExpenseRow) => !r.date && !r.bill_no && !r.expense_details && (!r.amount || Number(r.amount) === 0);

  const handleSubmit = async () => {
    if (formMode === 'od' && !selectedOD) { 
      setError('Please select an approved On Duty form'); return; 
    }

    if (formMode === 'od' && selectedOD) {
      const needsKss = String(selectedOD.form_data?.['kss_submission'] || '').trim().toUpperCase() === 'YES';
      if (needsKss && !eventDetails.kss_link) {
        setError('Please provide the required KSS Link for the selected On Duty form in the Event Details section.');
        return;
      }
    }
    
    if (formMode === 'manual') {
      const requiresOdFields = odClaim === 'yes';
      if (requiresOdFields && (!eventDetails.type || !eventDetails.reason)) {
        setError('Please fill OD Type and Reason fields.');
        return;
      }
      if (!eventDetails.from_date || !files.event_proof) {
        setError('Please fill all required event details (*) and upload event proof in the Event Details section.');
        return;
      }
      if (String(eventDetails.kss_submission || '').trim().toUpperCase() === 'YES' && !eventDetails.kss_link) {
        setError('Please provide the KSS Link since KSS Submission is Yes.');
        return;
      }
    }
    
    const invalidTravel = travel.some(r => !isTravelEmpty(r) && (!r.date || !r.mode_of_travel || !r.from || !r.to || !r.amount));
    if (invalidTravel) { setError('Please fill all required fields (*) in Travel Expenses for the rows you entered.'); return; }

    const invalidFood = food.some(r => !isFoodEmpty(r) && (!r.date || !r.amount));
    if (invalidFood) { setError('Please fill all required fields (*) in Food Expenses for the rows you entered.'); return; }

    const invalidOther = other.some((r, i) => !isOtherEmpty(r) && (!r.date || !r.bill_no || !r.expense_details || !r.amount || !files[`other_proof_${i}`]));
    if (invalidOther) { setError('Please fill all required fields (*) and upload proof in Other Expenses for the rows you entered.'); return; }

    if (Number(advanceAmount) > 0 && !advanceDate) {
      setError('Please provide the Advance Date since you entered an advance amount.');
      return;
    }

    if (Number(advanceAmount) > 0 && !files.advance_proof) {
      setError('Please upload an Advance Receipt Proof since you entered an advance amount.');
      return;
    }

    setError(''); setSubmitting(true);
    try {
      const fd = new FormData();
      if (formMode === 'od') {
        fd.append('on_duty_request_id', String(selectedOD!.id));
        const needsKss = String(selectedOD!.form_data?.['kss_submission'] || '').trim().toUpperCase() === 'YES';
        if (needsKss && eventDetails.kss_link) {
          fd.append('event_details', JSON.stringify({ kss_link: eventDetails.kss_link }));
        }
      } else {
        const detailsToSend = odClaim === 'no' 
          ? { ...eventDetails, type: '', reason: '' } 
          : { ...eventDetails, template_id: selectedOdTemplateId };
        fd.append('event_details', JSON.stringify(detailsToSend));
        fd.append('od_claim', odClaim);
      }

      fd.append('travel_expenses', JSON.stringify(travel.filter(r => !isTravelEmpty(r))));
      fd.append('food_expenses', JSON.stringify(food.filter(r => !isFoodEmpty(r))));
      fd.append('other_expenses', JSON.stringify(other.filter(r => !isOtherEmpty(r))));
      fd.append('total_fees_spend', String(feesSpend || 0));
      fd.append('advance_amount_received', String(advanceAmount || 0));
      if (advanceDate) fd.append('advance_date', advanceDate);
      Object.entries(files).forEach(([k, f]) => {
        fd.append(k, f);
        if (orientations[k]) fd.append(`${k}_orientation`, orientations[k]);
      });
      
      await submitEventForm(fd);
      setShowSuccessModal(true);
      setSelectedOD(null);
      setOdClaim('yes');
      setEventDetails({});
      setTravel([{ ...EMPTY_TRAVEL }]); setFood([{ ...EMPTY_FOOD }]);
      setOther([{ ...EMPTY_OTHER }]); setFeesSpend(0); setAdvanceAmount(0); setAdvanceDate(''); setFiles({}); setOrientations({});
      onSubmitted();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  const showExpenses = formMode === 'manual' || (formMode === 'od' && selectedOD !== null);

  return (
    <div className="space-y-6">
      {budget && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl border p-4 bg-blue-50/30 border-blue-100 flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-gray-800">Normal Events</h4>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Allocated Budget</p>
                <p className="text-lg font-bold text-gray-700">₹{budget.normal_events_budget.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-blue-600">Available Balance</p>
                <p className="text-2xl font-black text-blue-700">₹{budget.normal_available.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border p-4 bg-purple-50/30 border-purple-100 flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-gray-800">Conference Events</h4>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Allocated Budget</p>
                <p className="text-lg font-bold text-gray-700">₹{budget.conference_budget.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-purple-600">Available Balance</p>
                <p className="text-2xl font-black text-purple-700">₹{budget.conference_available.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
        <button 
          onClick={() => setFormMode('od')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${formMode === 'od' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <Link2 size={16} /> Link to Approved On Duty Form
        </button>
        <button 
          onClick={() => setFormMode('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${formMode === 'manual' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <FileText size={16} /> Apply New Expense Form (Direct)
        </button>
      </div>

      {formMode === 'od' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-3">Select Approved On Duty Form</h3>
          {availableODs.length === 0 ? (
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">No approved On Duty forms available for expense submission.</p>
          ) : (
            <div className="space-y-2">
              {availableODs.map(od => (
                <div key={od.id} className={`border rounded-xl transition-all ${selectedOD?.id === od.id ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                  <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => { setSelectedOD(od); setExpandedOD(expandedOD === od.id ? null : od.id); }}>
                    <div className="flex items-center gap-3">
                      <input type="radio" checked={selectedOD?.id === od.id} readOnly className="w-4 h-4 text-blue-600" />
                      <div>
                        {(() => {
                          const schema = od.form_schema || [];
                          const titleField = schema.find(f => f.name === 'event_title') || schema.find(f => f.type === 'text' && !f.name.includes('date'));
                          const dateField = schema.find(f => f.type === 'date' && (f.name.includes('from') || f.name.includes('start') || f.name === 'date'));
                          const secondaryField = schema.find(f => f.name.includes('institution') || f.name.includes('place') || f.name.includes('host'));
                          const title = (titleField && od.form_data[titleField.name]) || od.template_name;
                          const dateVal = (dateField && od.form_data[dateField.name]) || '';
                          const secondary = (secondaryField && od.form_data[secondaryField.name]) || '';
                          return (
                            <>
                              <p className="text-sm font-medium text-gray-900">{title}</p>
                              <p className="text-xs text-gray-500">{dateVal}{secondary ? ` — ${secondary}` : ''}</p>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    {expandedOD === od.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                   {expandedOD === od.id && (
                    <div className="border-t px-4 py-3 bg-gray-50/50">
                      {(() => {
                        const rows = getOrderedFormDataRows(od.form_data, od.form_schema || []);
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                            {rows.map(({ label, value }) => (
                              <div key={label} className="flex gap-1">
                                <span className="text-gray-500 shrink-0 font-medium">{label}:</span>
                                <span className="font-semibold text-gray-800 break-words">{value}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedOD && String(selectedOD.form_data?.['kss_submission'] || '').trim().toUpperCase() === 'YES' && (
            <div className="mt-6 border-t pt-4">
              <h3 className="text-base font-semibold text-gray-800 mb-3">Event Details</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KSS Link <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  value={eventDetails.kss_link || ''}
                  onChange={e => setEventDetails(prev => ({ ...prev, kss_link: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://..."
                />
                <p className="text-xs text-gray-500 mt-1">This On Duty form requires a KSS Submission. Please provide the link.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {formMode === 'manual' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-800 mb-2 border-b pb-2">Event Details</h3>

          <div className="flex items-center gap-4 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            <span className="text-xs font-bold text-gray-700">OD Claim <span className="text-red-500">*</span></span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="od_claim" value="yes" checked={odClaim === 'yes'} onChange={() => setOdClaim('yes')} className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Yes</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="od_claim" value="no" checked={odClaim === 'no'} onChange={() => setOdClaim('no')} className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">No</span>
            </label>
            <span className="text-xs text-gray-500 ml-2">
              {odClaim === 'yes' ? '✅ OD auto-submission active' : 'OD features disabled'}
            </span>
          </div>

          {odClaim === 'yes' && odTemplates.length > 1 && (
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 mb-1">Select OD Template Type <span className="text-red-500">*</span></label>
              <select value={selectedOdTemplateId || ''} onChange={e => setSelectedOdTemplateId(Number(e.target.value))} className="w-full md:w-1/2 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500">
                {odTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {(() => {
            const activeTemplate = odTemplates.find(t => t.id === selectedOdTemplateId) || odTemplates[0];
            if (!activeTemplate) return <div className="p-4 text-sm text-gray-500">Loading form schema...</div>;
            const schemaToRender = activeTemplate.form_schema.filter(field => {
              if (field.name === 'proof') return false;
              if (odClaim === 'no' && (field.name === 'type' || field.name === 'reason')) return false;
              return true;
            });
            return <DynamicFormRenderer fields={schemaToRender} values={eventDetails} onChange={setEventDetails} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" isExpenseForm={true} />;
          })()}

          {String(eventDetails.kss_submission || '').trim().toUpperCase() === 'YES' && (
            <div className="mt-4 pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                KSS Link <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                required
                value={eventDetails.kss_link || ''}
                onChange={e => setEventDetails(prev => ({ ...prev, kss_link: e.target.value }))}
                className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://..."
              />
            </div>
          )}

          <div className="pt-2 border-t mt-4">
             <label className="block text-xs font-bold text-gray-700 mb-2">Upload Event Attended Proof <span className="text-red-500">*</span></label>
             <DragDropFileInput fileKey="event_proof" files={files} orientations={orientations} onChange={handleFileChange} />
          </div>
        </div>
      )}

      {showExpenses && (
        <>
          <Section title="Travel Expenses" total={travelTotal}>
            {travel.map((row, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end border border-gray-100 rounded-lg p-3 bg-white">
                <Input label="Date" type="date" value={row.date} onChange={v => updateRow(travel, setTravel, i, 'date', v)} required />
                <Input label="Bill No." value={row.bill_no} onChange={v => updateRow(travel, setTravel, i, 'bill_no', v)} />
                <Input label="Mode of Travel" value={row.mode_of_travel} onChange={v => updateRow(travel, setTravel, i, 'mode_of_travel', v)} required />
                <Input label="From" value={row.from} onChange={v => updateRow(travel, setTravel, i, 'from', v)} required />
                <Input label="To" value={row.to} onChange={v => updateRow(travel, setTravel, i, 'to', v)} required />
                <Input label="Amount (₹)" type="number" value={row.amount || ''} onChange={v => updateRow(travel, setTravel, i, 'amount', Number(v) || 0)} required />
                <div className="flex gap-1 items-end">
                  <FileInput fileKey={`travel_proof_${i}`} files={files} onChange={handleFileChange} />
                  {travel.length > 1 && <button onClick={() => removeRow(travel, setTravel, i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>}
                </div>
              </div>
            ))}
            <button onClick={() => setTravel([...travel, { ...EMPTY_TRAVEL }])} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mt-1"><Plus size={14} /> Add Next</button>
          </Section>

          <Section title="Food Expenses" total={foodTotal}>
            {food.map((row, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end border border-gray-100 rounded-lg p-3 bg-white">
                <Input label="Date" type="date" value={row.date} onChange={v => updateRow(food, setFood, i, 'date', v)} required />
                <Input label="Bill No." value={row.bill_no} onChange={v => updateRow(food, setFood, i, 'bill_no', v)} />
                <Input label="Breakfast" value={row.breakfast || ''} onChange={v => updateRow(food, setFood, i, 'breakfast', v)} />
                <Input label="Lunch" value={row.lunch || ''} onChange={v => updateRow(food, setFood, i, 'lunch', v)} />
                <Input label="Dinner" value={row.dinner || ''} onChange={v => updateRow(food, setFood, i, 'dinner', v)} />
                <Input label="Amount (₹)" type="number" value={row.amount || ''} onChange={v => updateRow(food, setFood, i, 'amount', Number(v) || 0)} required />
                <div className="flex gap-1 items-end">
                  <FileInput fileKey={`food_proof_${i}`} files={files} onChange={handleFileChange} />
                  {food.length > 1 && <button onClick={() => removeRow(food, setFood, i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>}
                </div>
              </div>
            ))}
            <button onClick={() => setFood([...food, { ...EMPTY_FOOD }])} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mt-1"><Plus size={14} /> Add Next</button>
          </Section>

          <Section title="Other Expenses" total={otherTotal}>
            {other.map((row, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end border border-gray-100 rounded-lg p-3 bg-white">
                <Input label="S.No" value={i + 1} readOnly />
                <Input label="Date" type="date" value={row.date} onChange={v => updateRow(other, setOther, i, 'date', v)} required />
                <Input label="Bill No." value={row.bill_no} onChange={v => updateRow(other, setOther, i, 'bill_no', v)} required />
                <div className="md:col-span-2"><Input label="Expense Details" value={row.expense_details} onChange={v => updateRow(other, setOther, i, 'expense_details', v)} required /></div>
                <Input label="Amount (₹)" type="number" value={row.amount || ''} onChange={v => updateRow(other, setOther, i, 'amount', Number(v) || 0)} required />
                <div className="flex gap-1 items-end pb-1">
                  <FileInput fileKey={`other_proof_${i}`} files={files} onChange={handleFileChange} required />
                  {other.length > 1 && <button onClick={() => removeRow(other, setOther, i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>}
                </div>
              </div>
            ))}
            <button onClick={() => setOther([...other, { ...EMPTY_OTHER, s_no: other.length + 1 }])} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mt-1"><Plus size={14} /> Add Next</button>
          </Section>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Event Registration Fees Spent (₹)</label>
                <input type="number" value={feesSpend || ''} onChange={e => setFeesSpend(Number(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Advance Amount Received (₹)</label>
                <input type="number" value={advanceAmount || ''} onChange={e => setAdvanceAmount(Number(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Advance Date {Number(advanceAmount) > 0 && <span className="text-red-500">*</span>}
                </label>
                <input type="date" value={advanceDate} onChange={e => setAdvanceDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>

            {Number(advanceAmount) > 0 && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <label className="block text-xs font-bold text-amber-800 mb-2">Advance Receipt Proof <span className="text-red-500">*</span></label>
                <DragDropFileInput fileKey="advance_proof" files={files} orientations={orientations} onChange={handleFileChange} />
              </div>
            )}
            
            <div className="mt-2">
               <label className="block text-xs font-bold text-gray-700 mb-2">Upload Overall Event/Fees Proof</label>
               <DragDropFileInput fileKey="fees_proof" files={files} orientations={orientations} onChange={handleFileChange} />
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-600">Travel Total</span><span className="font-semibold">₹{travelTotal.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Food Total</span><span className="font-semibold">₹{foodTotal.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Other Total</span><span className="font-semibold">₹{otherTotal.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Fees Spent</span><span className="font-semibold">₹{(feesSpend || 0).toLocaleString()}</span></div>
              <div className="flex justify-between text-base border-t pt-2"><span className="font-bold text-gray-900">Grand Total</span><span className="font-bold text-blue-700">₹{grandTotal.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Advance Received</span><span className="font-semibold text-orange-600">- ₹{(advanceAmount || 0).toLocaleString()}</span></div>
              <div className={`flex justify-between text-base border-t pt-2`}>
                <span className="font-bold text-gray-900">{balance >= 0 ? 'Balance to be Received' : 'Amount to be Refunded'}</span>
                <span className={`font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {balance >= 0 ? <span className="flex items-center gap-1"><CheckCircle size={16} /> ₹{balance.toLocaleString()}</span> : <span className="flex items-center gap-1"><AlertTriangle size={16} /> ₹{Math.abs(balance).toLocaleString()}</span>}
                </span>
              </div>
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex gap-2"><AlertTriangle size={18} /> {error}</div>}

          <button onClick={handleSubmit} disabled={submitting} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md">
            {submitting ? 'Submitting...' : 'Submit Event Attending Form'}
          </button>
        </>
      )}

      {activeCropperFile && activeCropperKey && (
        <ImageCropperModal
          file={activeCropperFile}
          isOpen={true}
          onClose={() => { setActiveCropperFile(null); setActiveCropperKey(null); }}
          onSave={handleCropperSave}
        />
      )}

      {showSuccessModal && (
        <SubmissionSuccessModal onClose={() => setShowSuccessModal(false)} />
      )}
    </div>
  );
}

function SubmissionSuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
        {/* Green top accent */}
        <div className="h-2 bg-gradient-to-r from-emerald-400 to-green-500" />

        <div className="p-8 flex flex-col items-center text-center">
          {/* Animated checkmark */}
          <div className="relative w-20 h-20 mb-5">
            <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-40" />
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-200">
              <CheckCircle size={40} className="text-emerald-500" />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <PartyPopper size={20} className="text-amber-500" />
            <h2 className="text-2xl font-black text-gray-900">Form Submitted!</h2>
            <PartyPopper size={20} className="text-amber-500" />
          </div>
          <p className="text-gray-500 text-sm leading-relaxed mb-2">
            Your Event Attending form has been submitted successfully.
          </p>
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2 mb-6">
            Your form is now pending approval. You will be notified once it is reviewed.
          </p>

          <button
            onClick={onClose}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors shadow-md text-sm"
          >
            Great, Continue
          </button>
        </div>

        {/* Close icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function updateRow<T>(arr: T[], setter: React.Dispatch<React.SetStateAction<T[]>>, idx: number, field: keyof T, value: any) {
  const n = [...arr]; n[idx] = { ...n[idx], [field]: value }; setter(n);
}

function removeRow<T>(arr: T[], setter: React.Dispatch<React.SetStateAction<T[]>>, idx: number) {
  setter(arr.filter((_, i) => i !== idx));
}

function Section({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        <span className="text-sm font-bold text-blue-700">Total: ₹{total.toLocaleString()}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', readOnly = false, required = false }: { label: string; value: any; onChange?: (v: string) => void; type?: string; readOnly?: boolean; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 mb-0.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} readOnly={readOnly} onChange={e => onChange?.(e.target.value)}
        className={`w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg ${readOnly ? 'bg-gray-50 text-gray-500' : 'focus:ring-1 focus:ring-blue-500 focus:border-blue-500'}`} />
    </div>
  );
}

function FileInput({ fileKey, files, onChange, label, required }: { 
  fileKey: string; 
  files: Record<string, File>; 
  onChange: (k: string, f: File | null) => void; 
  label?: string; 
  required?: boolean;
}) {
  const file = files[fileKey];
  return (
    <div className="flex flex-col items-start gap-1">
      <label className="flex items-center gap-1 text-xs text-blue-600 cursor-pointer hover:text-blue-700" title={file?.name || 'Upload proof'}>
        <Upload size={14} />
        <span className="truncate max-w-[120px]">{file?.name || label || 'Proof'}</span>
        {required && <span className="text-red-500">*</span>}
        <input 
          key={file ? file.name + file.size : 'empty'}
          type="file" className="hidden" accept="image/*,application/pdf"
          onChange={e => onChange(fileKey, e.target.files?.[0] || null)} 
        />
      </label>
      {file && (
        <button type="button" onClick={() => onChange(fileKey, null)} className="text-[10px] text-red-500 hover:text-red-700 underline">Remove</button>
      )}
    </div>
  );
}

function DragDropFileInput({ fileKey, files, orientations, onChange }: { 
  fileKey: string; 
  files: Record<string, File>; 
  orientations: Record<string, 'portrait' | 'landscape'>;
  onChange: (k: string, f: File | null) => void; 
}) {
  const file = files[fileKey];
  const orientation = orientations[fileKey] || 'portrait';
  
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) onChange(fileKey, e.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col w-full">
      <label 
        className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-blue-200 rounded-xl cursor-pointer bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 transition-colors"
        onDragOver={handleDragOver} onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <Upload className="w-6 h-6 mb-2 text-blue-500" />
          <p className="text-sm text-gray-600 px-2 text-center">
            {file ? <span className="font-medium text-blue-700 truncate max-w-full block px-2">{file.name}</span> : <span><span className="font-medium text-blue-600">Click to upload</span> or drag and drop</span>}
          </p>
        </div>
        <input type="file" className="hidden" onChange={e => onChange(fileKey, e.target.files?.[0] || null)} />
      </label>
      
      {file && (
        <div className="mt-2 flex items-center justify-end gap-2 pr-1">
          <span className="text-xs text-gray-600 font-medium">Layout:</span>
          <span className="text-xs font-semibold text-blue-700 capitalize bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            {orientation}
          </span>
          <button 
            type="button"
            onClick={(e) => { e.preventDefault(); onChange(fileKey, null); }} 
            className="text-xs text-red-500 hover:text-red-700 underline ml-2"
          >
            Remove File
          </button>
        </div>
      )}
    </div>
  );
}
