import React, { forwardRef } from 'react';
import { MapPin, Calendar, Users, Star } from 'lucide-react';
import type { GuestInfo } from '../../../store/eventStore';

export interface PosterData {
  title: string;
  venue: string;
  dateTime: string;
  coordinatorCount: number;
  hasChiefGuest: boolean;
  chiefGuests: GuestInfo[];
}

interface Props {
  data: PosterData;
}

/**
 * PosterPreview – a Canva-style visual template rendered fully in HTML/CSS.
 * The outer div is forwarded as a ref so DownloadService can capture it.
 */
const PosterPreview = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const displayDate = data.dateTime
    ? new Date(data.dateTime).toLocaleString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Date & Time TBD';

  const guests = data.hasChiefGuest ? data.chiefGuests.filter((g) => g.name || g.imageDataUrl) : [];

  return (
    <div
      ref={ref}
      id="event-poster"
      style={{ fontFamily: "'Segoe UI', sans-serif", width: '520px', minHeight: '660px' }}
      className="relative overflow-hidden rounded-3xl shadow-2xl select-none"
    >
      {/* Background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 40%, #4c1d95 70%, #6d28d9 100%)',
        }}
      />

      {/* Decorative circles */}
      <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />
      <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-8 py-8 gap-5">
        {/* College header */}
        <div className="text-center">
          <p className="text-indigo-300 text-xs font-semibold uppercase tracking-[0.2em]">IDCS College</p>
          <p className="text-indigo-200 text-xs mt-0.5 tracking-wide">Presents</p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-60" />
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-60" />
        </div>

        {/* Event title */}
        <div className="text-center px-2">
          <h1
            className="text-white font-extrabold leading-tight text-center"
            style={{ fontSize: data.title.length > 30 ? '1.6rem' : '2rem', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
          >
            {data.title || 'Event Title'}
          </h1>
        </div>

        {/* Decorative star row */}
        <div className="flex items-center gap-2 text-amber-400">
          {'✦ ✦ ✦'.split(' ').map((s, i) => (
            <span key={i} className="text-sm">{s}</span>
          ))}
        </div>

        {/* Chief Guests */}
        {guests.length > 0 && (
          <div className="w-full">
            <p className="text-indigo-300 text-xs font-semibold uppercase tracking-widest text-center mb-3">
              Chief Guest{guests.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {guests.map((g, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  {g.imageDataUrl ? (
                    <img
                      src={g.imageDataUrl}
                      alt={g.name}
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '50%', border: '3px solid #a78bfa' }}
                    />
                  ) : (
                    <div
                      style={{ width: 72, height: 72, borderRadius: '50%', background: '#4c1d95', border: '3px solid #a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <span className="text-white text-xl font-bold">{g.name?.[0]?.toUpperCase() ?? '?'}</span>
                    </div>
                  )}
                  <p className="text-white text-xs font-semibold text-center" style={{ maxWidth: 80 }}>
                    {g.name || `Guest ${i + 1}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Horizontal rule */}
        <div className="w-full h-px bg-indigo-600/50" />

        {/* Event details */}
        <div className="w-full space-y-3">
          <div className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-2xl px-4 py-3">
            <Calendar className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide">Date & Time</p>
              <p className="text-white text-sm font-medium mt-0.5">{displayDate}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-2xl px-4 py-3">
            <MapPin className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide">Venue</p>
              <p className="text-white text-sm font-medium mt-0.5">{data.venue || 'Venue TBD'}</p>
            </div>
          </div>

          {data.coordinatorCount > 0 && (
            <div className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-2xl px-4 py-3">
              <Users className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide">Event Coordinators</p>
                <p className="text-white text-sm font-medium mt-0.5">{data.coordinatorCount} Coordinator{data.coordinatorCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="w-full text-center mt-2">
          <div className="inline-block bg-gradient-to-r from-amber-400 to-orange-400 text-gray-900 text-xs font-bold px-6 py-2 rounded-full shadow-lg">
            All Are Welcome!
          </div>
          <p className="text-indigo-400 text-xs mt-3 opacity-70">IDCS College · Official Event</p>
        </div>
      </div>
    </div>
  );
});

PosterPreview.displayName = 'PosterPreview';
export default PosterPreview;
