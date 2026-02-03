import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';

type PeriodItem = {
  id: number;
  section_id: number;
  section_name: string;
  period: { id: number; index: number; label?: string; start_time?: string; end_time?: string };
  subject?: string | null;
  subject_batch_id?: number | null;
  attendance_session_id?: number | null;
  attendance_session_locked?: boolean;
};

type Student = { id: number; reg_no: string; username: string };

export default function PeriodAttendance() {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PeriodItem | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPeriods();
  }, [date]);

  async function fetchPeriods() {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/academics/staff/periods/?date=${date}`);
      const j = await res.json();
      setPeriods(j.results || []);
    } catch (e) {
      console.error(e);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }

  async function openPeriod(p: PeriodItem) {
    setSelected(p);
    setStudents([]);
    setMarks({});
    setLoading(true);
    try {
      let studs: any[] = [];
      if (p.subject_batch_id) {
        // fetch students from the subject batch when period is batch-wise
        const bres = await fetchWithAuth(`/api/academics/subject-batches/${p.subject_batch_id}/`);
        if (bres.ok) {
          const bj = await bres.json();
          // subject-batch serializer returns students in `.students` or `.results` depending on view
          studs = bj.students || bj.results || [];
        }
      } else {
        const sres = await fetchWithAuth(`/api/academics/sections/${p.section_id}/students/`);
        const sj = await sres.json();
        studs = sj.results || [];
      }
      setStudents(studs);
      const initial: Record<number, string> = {};
      studs.forEach((s: any) => (initial[s.id] = 'P'));
      setMarks(initial);

      // If there's an existing attendance session, fetch records and populate marks
      if (p.attendance_session_id) {
        try {
          const pres = await fetchWithAuth(`/api/academics/period-attendance/${p.attendance_session_id}/`);
          if (pres.ok) {
            const pj = await pres.json();
            const recs = pj.records || [];
            const updated = { ...initial };
            recs.forEach((r: any) => {
              const sid = r.student_pk || (r.student && r.student.id) || null;
              if (sid) updated[sid] = r.status || updated[sid] || 'A';
            });
            setMarks(updated);
          }
        } catch (e) {
          console.error('Failed to load existing session records', e);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function setMark(studentId: number, status: string) {
    setMarks((m) => ({ ...m, [studentId]: status }));
  }

  async function saveMarks() {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = {
        section_id: selected.section_id,
        period_id: selected.period.id,
        date: date,
        records: students.map((s) => ({ student_id: s.id, status: marks[s.id] || 'A' })),
      };
      const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark/', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) {
        let errText = 'Save failed';
        try {
          const errJson = await res.json();
          errText = JSON.stringify(errJson);
        } catch (e) {
          try { errText = await res.text(); } catch (_){ }
        }
        console.error('Save failed response', res.status, errText);
        alert('Failed to save attendance: ' + errText);
        return;
      }
      const j = await res.json();
      alert('Attendance saved');
      // optionally refresh
      fetchPeriods();
    } catch (e) {
      console.error(e);
      alert('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>Period Attendance</h2>
      <div style={{ marginBottom: 12 }}>
        <label>Date: </label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div>
        <h3>Assigned Periods</h3>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {periods.map((p) => (
              <div key={p.id} style={{ border: '1px solid #ddd', padding: 12, borderRadius: 6, minWidth: 220 }}>
                <div style={{ fontWeight: 600 }}>{p.period.label || `Period ${p.period.index}`}</div>
                <div style={{ fontSize: 13, color: '#555' }}>{p.period.start_time || ''}{p.period.start_time && p.period.end_time ? ` — ${p.period.end_time}` : ''}</div>
                <div style={{ marginTop: 6 }}>{p.section_name}</div>
                <div style={{ marginTop: 6, fontStyle: 'italic' }}>{p.subject_display || p.subject || 'No subject'}</div>
                <div style={{ marginTop: 8 }}>
                  {p.attendance_session_locked ? (
                    <button disabled>Attendance Locked</button>
                  ) : (
                    <button onClick={() => openPeriod(p)}>{p.attendance_session_id ? 'Open Session' : 'Take Attendance'}</button>
                  )}
                </div>
              </div>
            ))}
            {!periods.length && <div>No periods assigned for this date</div>}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 18 }}>
          <h3>
            {selected.period.label || `Period ${selected.period.index}`} — {selected.section_name}
          </h3>
          <div>
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Reg No</th>
                  <th>Student</th>
                  <th>Present</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.reg_no}</td>
                    <td>{s.username}</td>
                    <td>
                      <select value={marks[s.id] || 'P'} onChange={(e) => setMark(s.id, e.target.value)}>
                        <option value="P">Present</option>
                        <option value="A">Absent</option>
                        <option value="LEAVE">Leave</option>
                        <option value="OD">On Duty</option>
                        <option value="LATE">Late</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12 }}>
              <button onClick={saveMarks} disabled={saving}>{saving ? 'Saving…' : 'Save Attendance'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
