import React, { forwardRef } from 'react';
import PosterPreview, { type PosterData } from './PosterPreview';
import type { BrandingTemplate, TemplateRegion } from '../../../store/templateStore';

interface Props {
  template: BrandingTemplate | null;
  data: PosterData;
}

/**
 * PosterRenderer — renders a CollegeEvent using a BrandingTemplate.
 *
 * If template is null, falls back to the default gradient PosterPreview.
 * Otherwise overlays placeholder text/image regions on the uploaded background.
 */
const PosterRenderer = forwardRef<HTMLDivElement, Props>(({ template, data }, ref) => {
  if (!template) {
    return <PosterPreview ref={ref} data={data} />;
  }

  const RENDER_W = 420; // display width in px for the poster card
  const RENDER_H = Math.round(RENDER_W / template.aspectRatio);

  function renderRegion(region: TemplateRegion) {
    const style: React.CSSProperties = {
      position: 'absolute',
      left: `${region.xPct}%`,
      top: `${region.yPct}%`,
      width: `${region.wPct}%`,
      height: `${region.hPct}%`,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
    };

    if (region.type === 'text') {
      const textStyle: React.CSSProperties = {
        fontSize: `${Math.round((region.fontSize / 700) * RENDER_W)}px`,
        fontWeight: region.fontWeight,
        fontStyle: region.fontStyle,
        color: region.color,
        textAlign: region.textAlign,
        width: '100%',
        lineHeight: 1.25,
        justifyContent: region.textAlign === 'left' ? 'flex-start' : region.textAlign === 'right' ? 'flex-end' : 'center',
      };

      let content = '';
      switch (region.placeholderKey) {
        case 'event_title':  content = data.title || 'Event Title'; break;
        case 'venue':        content = data.venue || 'Venue'; break;
        case 'department':   content = ''; break;  // not in PosterData yet
        case 'date_time':    content = data.dateTime
          ? new Date(data.dateTime).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'Date & Time'; break;
        case 'coordinators': content = data.coordinatorCount
          ? `Coordinated by ${data.coordinatorCount} coordinator${data.coordinatorCount > 1 ? 's' : ''}`
          : ''; break;
        default: break;
      }

      return (
        <div key={region.id} style={style}>
          <span style={textStyle}>{content}</span>
        </div>
      );
    }

    // image region — chief guests
    if (region.placeholderKey === 'chief_guests' && data.hasChiefGuest && data.chiefGuests.length > 0) {
      const guests = data.chiefGuests.slice(0, region.maxCount ?? 4);
      const isGrid = (region.layout ?? 'row') === 'grid';
      return (
        <div key={region.id} style={{
          ...style,
          flexWrap: isGrid ? 'wrap' : 'nowrap',
          gap: '4px',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          {guests.map((g, i) => (
            <div key={i} style={{
              flex: isGrid ? '0 0 auto' : '1 1 0',
              maxWidth: isGrid ? '48%' : undefined,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}>
              {g.imageDataUrl ? (
                <img
                  src={g.imageDataUrl}
                  alt={g.name}
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }}
                />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>
                    {g.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span style={{ color: 'white', fontSize: 9, fontWeight: 'bold', textAlign: 'center', maxWidth: 70, lineHeight: 1.2 }}>
                {g.name}
              </span>
            </div>
          ))}
        </div>
      );
    }

    return null;
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: RENDER_W,
        height: RENDER_H,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: 12,
      }}
    >
      {/* Background */}
      <img
        src={template.backgroundDataUrl}
        alt="poster bg"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        draggable={false}
      />
      {/* Overlay regions */}
      {template.regions.map((r) => renderRegion(r))}
    </div>
  );
});

PosterRenderer.displayName = 'PosterRenderer';
export default PosterRenderer;
