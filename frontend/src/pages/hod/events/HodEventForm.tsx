import React, { useRef } from 'react';
import {
  Calendar, MapPin, User, Users, Tag, BookOpen,
  Upload, X, GraduationCap, Briefcase, Image as ImageIcon,
} from 'lucide-react';
import type { GuestInfo } from '../../../store/eventStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResourcePerson {
  name: string;
  designation: string;
  photoDataUrl?: string;
}

export interface EventFormState {
  title: string;
  eventType: string;
  participants: string;
  venue: string;
  dateTime: string;
  resourcePersons: ResourcePerson[];
  facultyCoordinator1: string;
  facultyCoordinator2: string;
  studentCoordinator: string;
  departmentLogoDataUrl: string;
  // legacy
  coordinatorCount: number;
  hasChiefGuest: boolean;
  guestCount: number;
  chiefGuests: GuestInfo[];
}

export const EVENT_TYPES = [
  'Workshop','Seminar','Conference','Guest Lecture',
  'Cultural Event','Sports Event','Technical Event',
  'Hackathon','FDP','Webinar','Symposium','Other',
];

const cls = 'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all';

function Field({ label, icon: Icon, optional, children }: {
  label: string; icon: React.ElementType; optional?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
        <Icon className="w-4 h-4 text-gray-400" />{label}
        {optional && <span className="text-xs text-gray-400 font-normal">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

function PhotoUpload({ label, dataUrl, onChange, size=80 }: {
  label: string; dataUrl?: string; onChange: (url: string)=>void; size?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => onChange(ev.target?.result as string ?? '');
    r.readAsDataURL(f);
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-purple-400 transition-colors"
        style={{ width: size, height: size }} onClick={() => ref.current?.click()}>
        {dataUrl ? (
          <img src={dataUrl} alt={label} className="w-full h-full object-cover rounded-full" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <Upload className="w-4 h-4" />
            <span className="text-[9px] text-center leading-tight px-1">{label}</span>
          </div>
        )}
      </div>
      {dataUrl && (
        <button type="button" onClick={()=>onChange('')}
          className="text-[9px] text-red-400 hover:text-red-600 flex items-center gap-0.5">
          <X className="w-2.5 h-2.5" /> Remove
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}

interface Props { form: EventFormState; onChange: (u: EventFormState)=>void; }

export default function HodEventForm({ form, onChange }: Props) {
  function set<K extends keyof EventFormState>(k: K, v: EventFormState[K]) {
    onChange({ ...form, [k]: v });
  }
  function setRP(idx: number, key: keyof ResourcePerson, val: string) {
    const rps = [...form.resourcePersons];
    rps[idx] = { ...rps[idx], [key]: val };
    onChange({ ...form, resourcePersons: rps });
  }
  function addRP() {
    onChange({ ...form, resourcePersons: [...form.resourcePersons, { name:'', designation:'', photoDataUrl:'' }] });
  }
  function removeRP(idx: number) {
    onChange({ ...form, resourcePersons: form.resourcePersons.filter((_,i)=>i!==idx) });
  }
  function pickLogo() {
    const input = document.createElement('input');
    input.type='file'; input.accept='image/*';
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => set('departmentLogoDataUrl', ev.target?.result as string ?? '');
      r.readAsDataURL(f);
    };
    input.click();
  }

  return (
    <div className="space-y-4">

      <Field label="Title of Event *" icon={Tag}>
        <input type="text" required placeholder="e.g. National Seminar on AI" value={form.title}
          onChange={(e)=>set('title',e.target.value)} className={cls} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type of Event *" icon={BookOpen}>
          <select value={form.eventType} onChange={(e)=>set('eventType',e.target.value)} className={cls}>
            <option value="">— Select —</option>
            {EVENT_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Participants" icon={Users} optional>
          <input type="text" placeholder="e.g. UG / PG Students" value={form.participants}
            onChange={(e)=>set('participants',e.target.value)} className={cls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date & Time *" icon={Calendar}>
          <input type="datetime-local" required value={form.dateTime}
            onChange={(e)=>set('dateTime',e.target.value)} className={cls} />
        </Field>
        <Field label="Venue *" icon={MapPin}>
          <input type="text" required placeholder="e.g. Seminar Hall, Block B" value={form.venue}
            onChange={(e)=>set('venue',e.target.value)} className={cls} />
        </Field>
      </div>

      {/* Resource Persons */}
      <div className="border border-blue-100 rounded-2xl p-4 space-y-3 bg-blue-50/40">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
            <User className="w-4 h-4 text-blue-500" /> Resource Person(s)
          </p>
          {form.resourcePersons.length < 3 && (
            <button type="button" onClick={addRP}
              className="text-xs text-blue-600 font-semibold px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">
              + Add
            </button>
          )}
        </div>
        {form.resourcePersons.map((rp, idx) => (
          <div key={idx} className="flex items-start gap-3 bg-white rounded-xl p-3 border border-blue-100">
            <PhotoUpload label="Photo" dataUrl={rp.photoDataUrl}
              onChange={(url)=>setRP(idx,'photoDataUrl',url)} size={60} />
            <div className="flex-1 space-y-2">
              <input type="text" placeholder="Full Name *" value={rp.name}
                onChange={(e)=>setRP(idx,'name',e.target.value)} className={cls} />
              <input type="text" placeholder="Designation / Title" value={rp.designation}
                onChange={(e)=>setRP(idx,'designation',e.target.value)} className={cls} />
            </div>
            {form.resourcePersons.length > 1 && (
              <button type="button" onClick={()=>removeRP(idx)}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors mt-1">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Coordinators */}
      <div className="border border-green-100 rounded-2xl p-4 space-y-2 bg-green-50/40">
        <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5 mb-2">
          <GraduationCap className="w-4 h-4 text-green-600" /> Coordinators
        </p>
        <input type="text" placeholder="Faculty Coordinator 1 *" value={form.facultyCoordinator1}
          onChange={(e)=>set('facultyCoordinator1',e.target.value)} className={cls} />
        <input type="text" placeholder="Faculty Coordinator 2 (optional)" value={form.facultyCoordinator2}
          onChange={(e)=>set('facultyCoordinator2',e.target.value)} className={cls} />
        <input type="text" placeholder="Student Coordinator (optional)" value={form.studentCoordinator}
          onChange={(e)=>set('studentCoordinator',e.target.value)} className={cls} />
      </div>

      {/* Department Logo */}
      <div className="flex items-center gap-4 border border-gray-200 rounded-2xl p-3 bg-gray-50/60">
        <PhotoUpload label="Dept Logo" dataUrl={form.departmentLogoDataUrl}
          onChange={(url)=>set('departmentLogoDataUrl',url)} size={56} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-gray-400" /> Department Logo
            <span className="text-xs text-gray-400 font-normal">(optional)</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Appears in the poster header.</p>
        </div>
        {!form.departmentLogoDataUrl && (
          <button type="button" onClick={pickLogo}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-600 hover:border-purple-400 hover:text-purple-600 transition-colors">
            <ImageIcon className="w-3.5 h-3.5" /> Upload
          </button>
        )}
      </div>
    </div>
  );
}
