import React, { useEffect, useState } from 'react';
import ArticulationMatrix from '../components/ArticulationMatrix';
import { lsGet, lsSet } from '../utils/localStorage';

type Props = { courseId?: string };

export default function ArticulationMatrixPage({ courseId }: Props) {
  const [subject, setSubject] = useState<string>(courseId || '');
  const [matrix, setMatrix] = useState<any>(null);

  useEffect(() => {
    if (!subject) return;
    const k = `cdap_articulation_${subject}`;
    const v = lsGet<any>(k);
    setMatrix(v || null);
  }, [subject]);

  function generate() {
    const rev = lsGet<any>(`cdap_revisions_${subject}`) || { rows: [] };
    const generated = { rowsCount: rev.rows ? rev.rows.length : 0, createdAt: new Date().toISOString() };
    setMatrix(generated);
  }

  function save() {
    if (!subject || !matrix) return alert('No matrix to save');
    lsSet(`cdap_articulation_${subject}`, matrix);
    alert('Articulation matrix saved to localStorage');
  }

  return (
    <div>
      <h2>Articulation Matrix - {subject || 'No course selected'}</h2>
      {!courseId && (
        <div style={{ marginBottom: 12 }}>
          <label>Course ID: </label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter course id" />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <button onClick={generate}>Generate Matrix</button>
        <button onClick={save} style={{ marginLeft: 8 }} disabled={!matrix}>Save Matrix</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <ArticulationMatrix subjectId={subject} />
      </div>

      <div style={{ marginTop: 12 }}>
        <h4>Preview</h4>
        <pre style={{ background: '#f7f7f7', padding: 8 }}>{JSON.stringify(matrix, null, 2)}</pre>
      </div>
    </div>
  );
}
