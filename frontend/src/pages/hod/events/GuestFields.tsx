import React, { useRef } from 'react';
import { UserCircle, Upload, X, Plus, Minus } from 'lucide-react';
import type { GuestInfo } from '../../../store/eventStore';

interface Props {
  guests: GuestInfo[];
  count: number;
  onCountChange: (n: number) => void;
  onGuestChange: (index: number, field: keyof GuestInfo, value: string) => void;
  onImageUpload: (index: number, dataUrl: string) => void;
  onImageRemove: (index: number) => void;
}

export default function GuestFields({
  guests,
  count,
  onCountChange,
  onGuestChange,
  onImageUpload,
  onImageRemove,
}: Props) {
  // Keep a ref per guest for file inputs so we can trigger them programmatically
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleFile(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onImageUpload(index, dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  return (
    <div className="space-y-4">
      {/* Guest count stepper */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Number of Chief Guests
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onCountChange(Math.max(1, count - 1))}
            className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => onCountChange(Math.max(1, Math.min(10, Number(e.target.value))))}
            className="w-20 text-center border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => onCountChange(Math.min(10, count + 1))}
            className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* One card per guest */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {guests.slice(0, count).map((guest, idx) => (
          <div key={idx} className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Chief Guest {idx + 1}
            </p>

            {/* Name input */}
            <input
              type="text"
              placeholder={`Guest ${idx + 1} full name`}
              value={guest.name}
              onChange={(e) => onGuestChange(idx, 'name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            />

            {/* Image upload */}
            <div className="flex items-center gap-3">
              {guest.imageDataUrl ? (
                <div className="relative w-16 h-16 flex-shrink-0">
                  <img
                    src={guest.imageDataUrl}
                    alt={`Guest ${idx + 1}`}
                    className="w-16 h-16 rounded-xl object-cover border-2 border-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => onImageRemove(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-white flex-shrink-0">
                  <UserCircle className="w-8 h-8 text-gray-300" />
                </div>
              )}

              <div className="flex-1">
                <input
                  ref={(el) => { fileRefs.current[idx] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(idx, e)}
                />
                <button
                  type="button"
                  onClick={() => fileRefs.current[idx]?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-white hover:border-blue-400 transition-colors w-full justify-center"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {guest.imageDataUrl ? 'Change Photo' : 'Upload Photo'}
                </button>
                {!guest.imageDataUrl && (
                  <p className="text-xs text-gray-400 mt-1 text-center">JPG / PNG / WEBP</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
