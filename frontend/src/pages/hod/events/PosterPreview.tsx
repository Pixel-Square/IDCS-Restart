import React, { forwardRef } from 'react';
import type { GuestInfo } from '../../../store/eventStore';
import type { ResourcePerson } from './HodEventForm';

export interface PosterData {
  title: string;
  eventType?: string;
  participants?: string;
  venue: string;
  dateTime: string;
  resourcePersons?: ResourcePerson[];
  facultyCoordinator1?: string;
  facultyCoordinator2?: string;
  studentCoordinator?: string;
  departmentLogoDataUrl?: string;
  // legacy
  coordinatorCount: number;
  hasChiefGuest: boolean;
  chiefGuests: GuestInfo[];
}

interface Props { data: PosterData; }

function fmt(dateTime: string) {
  if (!dateTime) return { date: 'Date TBD', time: 'Time TBD', month: '', year: '' };
  const d = new Date(dateTime);
  return {
    date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    month: d.toLocaleDateString('en-IN', { month: 'long' }),
    year: d.getFullYear().toString(),
  };
}

/**
 * PosterPreview — Event Template 1
 * Professional academic college event poster (white background, structured layout).
 * Matches standard Indian college event flyer format.
 */
const PosterPreview = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const { date, time } = fmt(data.dateTime);
  const rps = (data.resourcePersons ?? []).filter(r => r.name.trim());
  const fc1 = data.facultyCoordinator1?.trim() ?? '';
  const fc2 = data.facultyCoordinator2?.trim() ?? '';
  const sc  = data.studentCoordinator?.trim() ?? '';
  const eventType = (data.eventType ?? '').toUpperCase();

  // Build coordinators array — include both faculty and student
  const allCoords: Array<{ name: string; role: string }> = [];
  if (fc1) allCoords.push({ name: fc1, role: 'Faculty Coordinator' });
  if (fc2) allCoords.push({ name: fc2, role: 'Faculty Coordinator' });
  if (sc)  allCoords.push({ name: sc,  role: 'Student Coordinator' });

  return (
    <div
      ref={ref}
      id="event-poster"
      style={{
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        width: '480px',
        background: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '4px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        userSelect: 'none',
        flexShrink: 0,
        border: '1px solid #e5e7eb',
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════
          HEADER — College branding bar
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#ffffff',
        borderBottom: '3px solid #b91c1c',
        padding: '14px 18px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* College logo / dept logo */}
        {data.departmentLogoDataUrl ? (
          <img src={data.departmentLogoDataUrl} alt="logo"
            style={{ width: 60, height: 60, objectFit: 'contain', flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 60, height: 60, borderRadius: 6,
            background: 'linear-gradient(135deg,#1e3a8a,#3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: '#fff', fontWeight: 800, fontSize: 22,
          }}>
            K
          </div>
        )}

        {/* College name block */}
        <div style={{ flex: 1 }}>
          <div style={{ color: '#1e3a8a', fontWeight: 800, fontSize: 14.5, letterSpacing: '0.02em', lineHeight: 1.2, textTransform: 'uppercase' }}>
            IDCS College of Engineering
          </div>
          <div style={{ color: '#374151', fontSize: 9.5, fontWeight: 500, marginTop: 2, letterSpacing: '0.01em' }}>
            Autonomous | Accredited by NAAC
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {['NBA', 'NAAC', 'NIRF'].map((b, i) => (
              <span key={i} style={{
                fontSize: 7.5, fontWeight: 700, color: '#1e3a8a',
                border: '1px solid #1e3a8a', borderRadius: 3, padding: '1px 5px',
                letterSpacing: '0.08em',
              }}>{b}</span>
            ))}
          </div>
        </div>

        {/* 25th anniversary / right badge placeholder */}
        <div style={{
          width: 48, height: 48, flexShrink: 0,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#b91c1c,#ef4444)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>25</div>
          <div style={{ fontSize: 6.5, fontWeight: 600, letterSpacing: '0.05em', textAlign: 'center' }}>YRS</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          DEPARTMENT BANNER
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{
        background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
        padding: '10px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          color: '#ffffff',
          fontWeight: 800,
          fontSize: 11.5,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          lineHeight: 1.35,
        }}>
          Department of Computer Science and Engineering
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ORGANIZES + EVENT TYPE
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{ textAlign: 'center', padding: '14px 20px 4px' }}>
        <div style={{
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontStyle: 'italic',
          color: '#374151',
          fontSize: 15,
          marginBottom: 8,
        }}>
          Organizes
        </div>

        {/* Event type badge */}
        {eventType && (
          <div style={{
            display: 'inline-block',
            background: '#fef2f2',
            border: '1.5px solid #fca5a5',
            borderRadius: 4,
            padding: '3px 14px',
            marginBottom: 8,
          }}>
            <span style={{ color: '#b91c1c', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }}>
              {eventType}
            </span>
          </div>
        )}

        {/* Event title */}
        <div style={{
          color: '#b91c1c',
          fontWeight: 900,
          fontSize: data.title.length > 30 ? '1.5rem' : '2rem',
          textTransform: 'uppercase',
          lineHeight: 1.15,
          letterSpacing: '0.02em',
          padding: '0 8px',
        }}>
          {data.title || 'EVENT NAME'}
        </div>

        {/* Participants badge */}
        {data.participants && (
          <div style={{ marginTop: 6, color: '#6b7280', fontSize: 9.5, fontWeight: 600 }}>
            for {data.participants}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          DECORATIVE DIAMOND RULE
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '10px 24px' }}>
        <div style={{ flex: 1, height: 1.5, background: 'linear-gradient(90deg,transparent,#b91c1c)' }} />
        <div style={{ width: 7, height: 7, background: '#b91c1c', transform: 'rotate(45deg)', margin: '0 6px' }} />
        <div style={{ width: 10, height: 10, background: '#b91c1c', transform: 'rotate(45deg)', margin: '0 2px' }} />
        <div style={{ width: 7, height: 7, background: '#b91c1c', transform: 'rotate(45deg)', margin: '0 6px' }} />
        <div style={{ flex: 1, height: 1.5, background: 'linear-gradient(90deg,#b91c1c,transparent)' }} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          DATE / TIME / VENUE ROW
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 0, padding: '0 18px', marginBottom: 12 }}>
        {/* Date */}
        <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRight: '1px solid #e5e7eb' }}>
          <div style={{ flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Date</div>
            <div style={{ color: '#111827', fontSize: 9.5, fontWeight: 700, marginTop: 1, lineHeight: 1.3 }}>{date}</div>
          </div>
        </div>
        {/* Time */}
        <div style={{ flex: '0 0 auto', minWidth: 100, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRight: '1px solid #e5e7eb' }}>
          <div style={{ flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Time</div>
            <div style={{ color: '#111827', fontSize: 9.5, fontWeight: 700, marginTop: 1 }}>{time} onwards</div>
          </div>
        </div>
        {/* Venue */}
        <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px' }}>
          <div style={{ flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Venue</div>
            <div style={{ color: '#111827', fontSize: 9.5, fontWeight: 700, marginTop: 1, lineHeight: 1.3 }}>{data.venue || 'Venue TBD'}</div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          RESOURCE PERSONS SECTION
      ═══════════════════════════════════════════════════════════════ */}
      {rps.length > 0 && (
        <div style={{
          margin: '0 18px 14px',
          padding: '12px 14px',
          background: '#f8fafc',
          borderRadius: 6,
          border: '1px solid #e2e8f0',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative red triangle accent (like KRCE template) */}
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: 0, height: 0,
            borderStyle: 'solid',
            borderWidth: '0 80px 80px 0',
            borderColor: 'transparent #b91c1c transparent transparent',
            opacity: 0.12,
          }} />

          <div style={{ color: '#6b7280', fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
            {rps.length > 1 ? 'Chief Guests / Resource Persons' : 'Chief Guest / Resource Person'}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {rps.map((rp, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', flex: rps.length === 1 ? '0 0 auto' : '0 0 200px' }}>
                {/* Photo */}
                <div style={{
                  flexShrink: 0,
                  width: rps.length === 1 ? 70 : 58,
                  height: rps.length === 1 ? 80 : 66,
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: '2px solid #b91c1c',
                  background: '#f1f5f9',
                  position: 'relative',
                }}>
                  {/* Red triangle bottom-right decoration like KRCE template */}
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 0, height: 0, borderStyle: 'solid',
                    borderWidth: '0 0 28px 28px',
                    borderColor: 'transparent transparent #b91c1c transparent',
                    zIndex: 2,
                  }} />
                  {rp.photoDataUrl ? (
                    <img src={rp.photoDataUrl} alt={rp.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)', color: '#94a3b8', fontWeight: 700, fontSize: 20,
                    }}>
                      {rp.name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Name & designation */}
                <div>
                  <div style={{ color: '#1e3a8a', fontWeight: 800, fontSize: 10.5, lineHeight: 1.3, maxWidth: 160 }}>
                    {rp.name.toUpperCase()}
                  </div>
                  {rp.designation && (
                    <div style={{ color: '#374151', fontSize: 9, marginTop: 3, lineHeight: 1.4, maxWidth: 160 }}>
                      {rp.designation}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          COORDINATORS SECTION
      ═══════════════════════════════════════════════════════════════ */}
      {allCoords.length > 0 && (
        <div style={{ margin: '0 18px 14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            <div style={{ width: 6, height: 6, background: '#b91c1c', transform: 'rotate(45deg)' }} />
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          <div style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}>
            {allCoords.map((c, i) => (
              <div key={i} style={{
                textAlign: 'center',
                padding: '7px 10px',
                flex: '0 0 auto',
                minWidth: 120,
                borderTop: `2px solid #b91c1c`,
              }}>
                <div style={{ color: '#1e3a8a', fontWeight: 800, fontSize: 9.5, letterSpacing: '0.01em', lineHeight: 1.3 }}>
                  {c.name.toUpperCase()}
                </div>
                <div style={{ color: '#6b7280', fontSize: 8, marginTop: 2 }}>{c.role}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#1e3a8a',
        padding: '8px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['🌐', '📱', '✉'].map((icon, i) => (
            <div key={i} style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9,
            }}>{icon}</div>
          ))}
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 7.5 }}>idcscollege.ac.in</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, letterSpacing: '0.08em', textAlign: 'right' }}>
          All Are Welcome!
        </div>
      </div>
    </div>
  );
});

PosterPreview.displayName = 'PosterPreview';
export default PosterPreview;
