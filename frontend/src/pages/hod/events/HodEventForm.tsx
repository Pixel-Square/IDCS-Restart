import React from 'react';
import { Calendar, MapPin, Users, User2, CheckSquare, Square } from 'lucide-react';
import GuestFields from './GuestFields';
import type { GuestInfo } from '../../../store/eventStore';

export interface EventFormState {
  title: string;
  venue: string;
  dateTime: string;
  coordinatorCount: number;
  hasChiefGuest: boolean;
  guestCount: number;
  chiefGuests: GuestInfo[];
}

interface Props {
  form: EventFormState;
  onChange: (updated: EventFormState) => void;
}

function field(label: string, icon: React.ElementType, children: React.ReactNode) {
  const Icon = icon;
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
        <Icon className="w-4 h-4 text-gray-400" /> {label}
      </label>
      {children}
    </div>
  );
}

export default function HodEventForm({ form, onChange }: Props) {
  function set<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  function handleGuestCountChange(n: number) {
    const next = Array.from({ length: n }, (_, i) => form.chiefGuests[i] ?? { name: '', imageDataUrl: undefined });
    onChange({ ...form, guestCount: n, chiefGuests: next });
  }

  function handleGuestChange(index: number, key: keyof GuestInfo, value: string) {
    const updated = form.chiefGuests.map((g, i) => (i === index ? { ...g, [key]: value } : g));
    onChange({ ...form, chiefGuests: updated });
  }

  function handleImageUpload(index: number, dataUrl: string) {
    const updated = form.chiefGuests.map((g, i) => (i === index ? { ...g, imageDataUrl: dataUrl } : g));
    onChange({ ...form, chiefGuests: updated });
  }

  function handleImageRemove(index: number) {
    const updated = form.chiefGuests.map((g, i) => (i === index ? { ...g, imageDataUrl: undefined } : g));
    onChange({ ...form, chiefGuests: updated });
  }

  function handleChiefGuestToggle() {
    const enabling = !form.hasChiefGuest;
    const guests = enabling && form.chiefGuests.length === 0 ? [{ name: '' }] : form.chiefGuests;
    const count  = enabling && form.guestCount === 0 ? 1 : form.guestCount;
    onChange({ ...form, hasChiefGuest: enabling, chiefGuests: guests, guestCount: count });
  }

  const inputCls =
    'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all';

  return (
    <div className="space-y-5">
      {/* Event Title */}
      {field('Event Title *', User2, (
        <input
          type="text"
          required
          placeholder="e.g. Annual Day 2025"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          className={inputCls}
        />
      ))}

      {/* Venue */}
      {field('Venue *', MapPin, (
        <input
          type="text"
          required
          placeholder="e.g. Main Auditorium, Block A"
          value={form.venue}
          onChange={(e) => set('venue', e.target.value)}
          className={inputCls}
        />
      ))}

      {/* Date & Time */}
      {field('Date & Time *', Calendar, (
        <input
          type="datetime-local"
          required
          value={form.dateTime}
          onChange={(e) => set('dateTime', e.target.value)}
          className={inputCls}
        />
      ))}

      {/* Number of Event Coordinators */}
      {field('Number of Event Coordinators', Users, (
        <input
          type="number"
          min={0}
          max={100}
          value={form.coordinatorCount}
          onChange={(e) => set('coordinatorCount', Math.max(0, Number(e.target.value)))}
          className={inputCls}
        />
      ))}

      {/* Chief Guest toggle */}
      <div>
        <button
          type="button"
          onClick={handleChiefGuestToggle}
          className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors"
        >
          {form.hasChiefGuest
            ? <CheckSquare className="w-5 h-5 text-blue-600" />
            : <Square className="w-5 h-5 text-gray-400" />}
          Chief Guest Invited
        </button>

        {form.hasChiefGuest && (
          <div className="mt-4 pl-2 border-l-4 border-blue-200">
            <GuestFields
              guests={form.chiefGuests}
              count={form.guestCount}
              onCountChange={handleGuestCountChange}
              onGuestChange={handleGuestChange}
              onImageUpload={handleImageUpload}
              onImageRemove={handleImageRemove}
            />
          </div>
        )}
      </div>
    </div>
  );
}
