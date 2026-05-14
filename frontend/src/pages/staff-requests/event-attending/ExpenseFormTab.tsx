import React, { useState } from 'react';
import type { ApprovedODForm, TravelExpenseRow, FoodExpenseRow, OtherExpenseRow } from '../../../types/eventAttending';
import type { MyEventBudget } from '../../../types/eventAttending';
import { submitEventForm } from '../../../services/eventAttending';
import { ChevronDown, ChevronUp, Plus, Trash2, Upload, CheckCircle, AlertTriangle } from 'lucide-react';

interface Props {
  odForms: ApprovedODForm[];
  budget: MyEventBudget | null;
  onSubmitted: () => void;
}

const EMPTY_TRAVEL: TravelExpenseRow = { date: '', bill_no: '', mode_of_travel: '', from: '', to: '', amount: 0 };
const EMPTY_FOOD: FoodExpenseRow = { date: '', bill_no: '', breakfast: '', lunch: '', dinner: '', amount: 0 };
const EMPTY_OTHER: OtherExpenseRow = { s_no: 1, date: '', bill_no: '', expense_details: '', amount: 0 };

const EVENT_FIELD_LABELS: Record<string, string> = {
  event_title: 'Event Title', host_institution_name: 'Host Institution',
  mode_of_event: 'Mode of Event', nature_of_event: 'Nature of Event',
  platform_if_online: 'Platform (if Online)', expected_outcome: 'Expected Outcome',
  purpose: 'Purpose', type: 'Type', reason: 'Reason',
  from_date: 'From Date', to_date: 'To Date', from_noon: 'From (Session)', to_noon: 'To (Session)',
};

export default function ExpenseFormTab({ odForms, budget, onSubmitted }: Props) {
  const [selectedOD, setSelectedOD] = useState<ApprovedODForm | null>(null);
  const [expandedOD, setExpandedOD] = useState<number | null>(null);
  const [travel, setTravel] = useState<TravelExpenseRow[]>([{ ...EMPTY_TRAVEL }]);
  const [food, setFood] = useState<FoodExpenseRow[]>([{ ...EMPTY_FOOD }]);
  const [other, setOther] = useState<OtherExpenseRow[]>([{ ...EMPTY_OTHER }]);
  const [feesSpend, setFeesSpend] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceDate, setAdvanceDate] = useState('');
  const [files, setFiles] = useState<Record<string, File>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const travelTotal = travel.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const foodTotal = food.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const otherTotal = other.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const grandTotal = travelTotal + foodTotal + otherTotal + (Number(feesSpend) || 0);
  const balance = grandTotal - (Number(advanceAmount) || 0);

  const availableODs = odForms.filter(f => !f.has_event_form);

  const handleFileChange = (key: string, file: File | null) => {
    if (file) setFiles(p => ({ ...p, [key]: file }));
    else { const n = { ...files }; delete n[key]; setFiles(n); }
  };

  const isTravelEmpty = (r: TravelExpenseRow) => !r.date && !r.bill_no && !r.mode_of_travel && !r.from && !r.to && (!r.amount || Number(r.amount) === 0);
  const isFoodEmpty = (r: FoodExpenseRow) => !r.date && !r.bill_no && !r.breakfast && !r.lunch && !r.dinner && (!r.amount || Number(r.amount) === 0);
  const isOtherEmpty = (r: OtherExpenseRow) => !r.date && !r.bill_no && !r.expense_details && (!r.amount || Number(r.amount) === 0);

  const handleSubmit = async () => {
    if (!selectedOD) { setError('Please select an approved On Duty form'); return; }
    
    const invalidTravel = travel.some(r => !isTravelEmpty(r) && (!r.date || !r.mode_of_travel || !r.from || !r.to || !r.amount));
    if (invalidTravel) { setError('Please fill all required fields (*) in Travel Expenses for the rows you entered.'); return; }

    const invalidFood = food.some(r => !isFoodEmpty(r) && (!r.date || !r.amount));
    if (invalidFood) { setError('Please fill all required fields (*) in Food Expenses for the rows you entered.'); return; }

    const invalidOther = other.some((r, i) => !isOtherEmpty(r) && (!r.date || !r.bill_no || !r.expense_details || !r.amount || !files[`other_proof_${i}`]));
    if (invalidOther) { setError('Please fill all required fields (*) and upload proof in Other Expenses for the rows you entered.'); return; }

    setError(''); setSuccess(''); setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('on_duty_request_id', String(selectedOD.id));
      fd.append('travel_expenses', JSON.stringify(travel.filter(r => !isTravelEmpty(r))));
      fd.append('food_expenses', JSON.stringify(food.filter(r => !isFoodEmpty(r))));
      fd.append('other_expenses', JSON.stringify(other.filter(r => !isOtherEmpty(r))));
      fd.append('total_fees_spend', String(feesSpend || 0));
      fd.append('advance_amount_received', String(advanceAmount || 0));
      if (advanceDate) fd.append('advance_date', advanceDate);
      Object.entries(files).forEach(([k, f]) => fd.append(k, f));
      await submitEventForm(fd);
      setSuccess('Event Attending form submitted successfully!');
      setSelectedOD(null); setTravel([{ ...EMPTY_TRAVEL }]); setFood([{ ...EMPTY_FOOD }]);
      setOther([{ ...EMPTY_OTHER }]); setFeesSpend(0); setAdvanceAmount(0); setAdvanceDate(''); setFiles({});
      onSubmitted();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      {/* Budget Summary */}
      {budget && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'Normal Events Available', value: budget.normal_available, color: budget.normal_available > 0 ? 'green' : 'red' },
            { label: 'Conference Available', value: budget.conference_available, color: budget.conference_available > 0 ? 'green' : 'red' },
          ].map((b, i) => (
            <div key={i} className={`rounded-xl border p-3 bg-${b.color}-50 border-${b.color}-200`}>
              <p className={`text-xs font-medium text-${b.color}-600`}>{b.label}</p>
              <p className={`text-lg font-bold text-${b.color}-700`}>₹{b.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Approved OD Forms */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Approved On Duty Forms</h3>
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
                      <p className="text-sm font-medium text-gray-900">{od.form_data.event_title || od.template_name}</p>
                      <p className="text-xs text-gray-500">{od.form_data.from_date} — {od.form_data.host_institution_name || 'N/A'}</p>
                    </div>
                  </div>
                  {expandedOD === od.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedOD === od.id && (
                  <div className="border-t px-4 py-3 bg-gray-50/50 grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(od.form_data).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k}><span className="text-gray-500">{EVENT_FIELD_LABELS[k] || k}:</span> <span className="font-medium text-gray-800">{String(v)}</span></div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedOD && (
        <>
          {/* Travel Expenses */}
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

          {/* Food Expenses */}
          <Section title="Food Expenses" total={foodTotal}>
            {food.map((row, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end border border-gray-100 rounded-lg p-3 bg-white">
                <Input label="Date" type="date" value={row.date} onChange={v => updateRow(food, setFood, i, 'date', v)} required />
                <Input label="Bill No." value={row.bill_no} onChange={v => updateRow(food, setFood, i, 'bill_no', v)} />
                <Input label="Breakfast" type="text" value={row.breakfast || ''} onChange={v => updateRow(food, setFood, i, 'breakfast', v)} />
                <Input label="Lunch" type="text" value={row.lunch || ''} onChange={v => updateRow(food, setFood, i, 'lunch', v)} />
                <Input label="Dinner" type="text" value={row.dinner || ''} onChange={v => updateRow(food, setFood, i, 'dinner', v)} />
                <Input label="Amount (₹)" type="number" value={row.amount || ''} onChange={v => updateRow(food, setFood, i, 'amount', Number(v) || 0)} required />
                <div className="flex gap-1 items-end">
                  <FileInput fileKey={`food_proof_${i}`} files={files} onChange={handleFileChange} />
                  {food.length > 1 && <button onClick={() => removeRow(food, setFood, i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>}
                </div>
              </div>
            ))}
            <button onClick={() => setFood([...food, { ...EMPTY_FOOD }])} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mt-1"><Plus size={14} /> Add Next</button>
          </Section>

          {/* Other Expenses */}
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

          {/* Fees & Advance */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Total Fees Spend (₹)</label>
                <input type="number" value={feesSpend || ''} onChange={e => setFeesSpend(Number(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Advance Amount Received (₹)</label>
                <input type="number" value={advanceAmount || ''} onChange={e => setAdvanceAmount(Number(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Advance Date</label>
                <input type="date" value={advanceDate} onChange={e => setAdvanceDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>
            
            <div className="mt-2">
               <label className="block text-xs font-bold text-gray-700 mb-2">Upload Overall Event/Fees Proof</label>
               <DragDropFileInput fileKey="fees_proof" files={files} onChange={handleFileChange} />
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-600">Travel Total</span><span className="font-semibold">₹{travelTotal.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Food Total</span><span className="font-semibold">₹{foodTotal.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Other Total</span><span className="font-semibold">₹{otherTotal.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Fees Spend</span><span className="font-semibold">₹{(feesSpend || 0).toLocaleString()}</span></div>
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

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

          <button onClick={handleSubmit} disabled={submitting} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {submitting ? 'Submitting...' : 'Submit Event Attending Form'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

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

function FileInput({ fileKey, files, onChange, label, required }: { fileKey: string; files: Record<string, File>; onChange: (k: string, f: File | null) => void; label?: string; required?: boolean }) {
  return (
    <label className="flex items-center gap-1 text-xs text-blue-600 cursor-pointer hover:text-blue-700" title={files[fileKey]?.name || 'Upload proof'}>
      <Upload size={14} />
      <span className="truncate max-w-[60px]">{files[fileKey]?.name || label || 'Proof'}</span>
      {required && <span className="text-red-500">*</span>}
      <input type="file" className="hidden" onChange={e => onChange(fileKey, e.target.files?.[0] || null)} />
    </label>
  );
}

function DragDropFileInput({ fileKey, files, onChange, label }: { fileKey: string; files: Record<string, File>; onChange: (k: string, f: File | null) => void; label?: string }) {
  const file = files[fileKey];
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onChange(fileKey, e.dataTransfer.files[0]);
    }
  };

  return (
    <label 
      className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-blue-200 rounded-xl cursor-pointer bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 transition-colors"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center pt-5 pb-6">
        <Upload className="w-6 h-6 mb-2 text-blue-500" />
        <p className="text-sm text-gray-600 px-2 text-center">
          {file ? <span className="font-medium text-blue-700 truncate max-w-full block px-2">{file.name}</span> : <span><span className="font-medium text-blue-600">Click to upload</span> or drag and drop</span>}
        </p>
      </div>
      <input type="file" className="hidden" onChange={e => onChange(fileKey, e.target.files?.[0] || null)} />
    </label>
  );
}
