import React, { useEffect, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';

export default function IQACData({ subjectId }: { subjectId?: string }) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!subjectId) return setText('');
    const v = lsGet<any>(`iqac_data_${subjectId}`) || '';
    setText(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  }, [subjectId]);

  function save() {
    if (!subjectId) return alert('Set subjectId');
    try {
      const parsed = JSON.parse(text);
      lsSet(`iqac_data_${subjectId}`, parsed);
      alert('Saved IQAC data');
    } catch (e) {
      lsSet(`iqac_data_${subjectId}`, text);
      alert('Saved IQAC text');
    }
  }

  return (
    <div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={6} style={{ width: '100%' }} />
      <div style={{ marginTop: 8 }}>
        <button onClick={save}>Save IQAC</button>
      </div>
    </div>
  );
}