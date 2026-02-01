import React from 'react';
// Images are optional; reference them from the served `assets/` folder if present.
// Using string URLs avoids a build-time error when the files are not present.

const containerStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 12,
  background: 'linear-gradient(180deg,#ffffff, #f6fbff)',
  border: '1px solid #e6eef8',
  boxShadow: '0 6px 20px rgba(13, 60, 100, 0.06)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 14,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: '#0b4a6f',
  fontSize: 20,
  fontWeight: 700,
};

const subStyle: React.CSSProperties = {
  marginTop: 6,
  color: '#264653',
  fontSize: 13,
};

export default function LCAInstructionsPage(): JSX.Element {
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>LCA Instructions</h2>
          <div style={subStyle}>Learner Centric Approach (LCA) planning and instruction levels — default guidance for all courses.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: 14, border: '1px solid #e9f0f7' }}>
          <h3 style={{ marginTop: 0, color: '#0b3b57' }}>Overview</h3>
          <p style={{ color: '#334e68' }}>
            This page contains the LCA planning matrix and instruction level guidance to be used as a default
            for all courses. The visual guidance (below) is continuous across two panels — if you have the
            LCA planning images, place them in <code>src/assets/lca-1.png</code> and <code>src/assets/lca-2.png</code>.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e9f0f7', background: '#ffffff' }}>
            <img alt="LCA part 1" src="/assets/lca-1.png" style={{ width: '100%', display: 'block' }} onError={(e:any)=>{ e.currentTarget.style.display='none'; }} />
            <div style={{ padding: 12 }}>
              <strong style={{ color: '#0b4a6f' }}>Step 1 — Learner Profile</strong>
              <p style={{ margin: '8px 0 0', color: '#334e68' }}>Identify current CGPA profile and prerequisite profile, then map to learner profile (L1–L3).</p>
            </div>
          </div>

          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e9f0f7', background: '#ffffff' }}>
            <img alt="LCA part 2" src="/assets/lca-2.png" style={{ width: '100%', display: 'block' }} onError={(e:any)=>{ e.currentTarget.style.display='none'; }} />
            <div style={{ padding: 12 }}>
              <strong style={{ color: '#0b4a6f' }}>Step 2–4 — IL Mapping & Instruction Levels</strong>
              <p style={{ margin: '8px 0 0', color: '#334e68' }}>Use the IL mapping tables to determine instruction levels (IL-1..IL-3) and distribution of assessment items per learner profile.</p>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e9f0f7' }}>
          <h3 style={{ marginTop: 0, color: '#0b3b57' }}>How to use</h3>
          <ol style={{ color: '#334e68' }}>
            <li>Identify learner profile (L1/L2/L3) for a given course offering.</li>
            <li>Refer to the IL mapping table to decide distribution across IL-1..IL-3.</li>
            <li>Apply the distribution when preparing teaching plan and question banks (PT/CO/BTL mapping).</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
