import React from 'react';

// Dummy ArticulationMatrix component for placeholder
export default function ArticulationMatrix({ subjectId }: { subjectId: string }) {
  return (
    <div style={{ border: '1px dashed #bbb', padding: 16, borderRadius: 8, color: '#666' }}>
      Articulation Matrix content for subject: <b>{subjectId || 'N/A'}</b>
    </div>
  );
}
