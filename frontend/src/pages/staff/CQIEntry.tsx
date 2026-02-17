import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../../services/roster';
import { lsGet, lsSet } from '../../utils/localStorage';
import { 
  fetchPublishedSsa1, 
  fetchPublishedSsa2, 
  fetchPublishedFormative1, 
  fetchPublishedFormative,
  fetchPublishedCia1Sheet,
  fetchPublishedCiaSheet
} from '../../services/obe';
import fetchWithAuth from '../../services/fetchAuth';
import { fetchAssessmentMasterConfig } from '../../services/cdapDb';

interface CQIEntryProps {
  subjectId?: string;
  teachingAssignmentId?: number;
  assessmentType?: 'cia1' | 'cia2' | 'model';
  cos?: string[];
}

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type CQIEntry = {
  [key: string]: number | null; // e.g., co1: 5, co2: null
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNumOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compareStudentName(a: { name?: string; reg_no?: string }, b: { name?: string; reg_no?: string }) {
  const an = String(a?.name || '').trim().toLowerCase();
  const bn = String(b?.name || '').trim().toLowerCase();
  if (an && bn) {
    const byName = an.localeCompare(bn);
    if (byName) return byName;
  } else if (an || bn) {
    return an ? -1 : 1;
  }
  const ar = String(a?.reg_no || '').trim();
  const br = String(b?.reg_no || '').trim();
  return ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
}

export default function CQIEntry({ 
  subjectId, 
  teachingAssignmentId, 
  assessmentType,
  cos 
}: CQIEntryProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [coTotals, setCoTotals] = useState<Record<number, Record<string, { value: number; max: number } | null>>>({});
  const [cqiEntries, setCqiEntries] = useState<Record<number, CQIEntry>>({});
  const [masterCfg, setMasterCfg] = useState<any>(null);

  const THRESHOLD_PERCENT = 58;

  // Parse COs from the cos array (e.g., ["CO1", "CO2"] => [1, 2])
  const coNumbers = useMemo(() => {
    if (!cos || !Array.isArray(cos)) return [];
    return cos
      .map(co => {
        const match = co.match(/\d+/);
        return match ? parseInt(match[0]) : null;
      })
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
  }, [cos]);

  // Load master config
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [subjectId]);

  // Load roster
  useEffect(() => {
    if (!teachingAssignmentId) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const resp = await fetchTeachingAssignmentRoster(teachingAssignmentId);
        if (!mounted) return;
        
        const roster = (resp.students || [])
          .map((s: TeachingAssignmentRosterStudent) => ({
            id: Number(s.id),
            reg_no: String(s.reg_no ?? ''),
            name: String(s.name ?? ''),
            section: s.section ?? null,
          }))
          .filter((s) => Number.isFinite(s.id))
          .sort(compareStudentName);
        
        setStudents(roster);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load roster');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [teachingAssignmentId]);

  // Load CQI entries from localStorage
  useEffect(() => {
    if (!subjectId || !teachingAssignmentId) return;
    const key = `cqi_entries_${subjectId}_${teachingAssignmentId}`;
    const stored = lsGet<Record<number, CQIEntry>>(key);
    if (stored && typeof stored === 'object') {
      setCqiEntries(stored);
    }
  }, [subjectId, teachingAssignmentId]);

  // Calculate CO totals from internal marks
  useEffect(() => {
    if (!subjectId || !teachingAssignmentId || students.length === 0 || coNumbers.length === 0) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        
        // Fetch published marks based on which COs we need
        const [ssa1Res, ssa2Res, f1Res, f2Res, cia1Res, cia2Res] = await Promise.all([
          coNumbers.some(co => co === 1 || co === 2) ? fetchPublishedSsa1(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },
          coNumbers.some(co => co === 3 || co === 4) ? fetchPublishedSsa2(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },
          coNumbers.some(co => co === 1 || co === 2) ? fetchPublishedFormative1(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },
          coNumbers.some(co => co === 3 || co === 4) ? fetchPublishedFormative('formative2', subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },
          coNumbers.some(co => co === 1 || co === 2) ? fetchPublishedCia1Sheet(subjectId, teachingAssignmentId).catch(() => ({ data: null })) : { data: null },
          coNumbers.some(co => co === 3 || co === 4) ? fetchPublishedCiaSheet('cia2', subjectId, teachingAssignmentId).catch(() => ({ data: null })) : { data: null },
        ]);

        if (!mounted) return;

        // Get weights from config or use defaults
        const DEFAULT_WEIGHTS = { ssa: 1.5, cia: 3.0, fa: 2.5 };
        const weights = {
          ssa: DEFAULT_WEIGHTS.ssa,
          cia: DEFAULT_WEIGHTS.cia,
          fa: DEFAULT_WEIGHTS.fa,
        };

        // Get max values from master config
        const ssa1Cfg = masterCfg?.assessments?.ssa1 || {};
        const ssa2Cfg = masterCfg?.assessments?.ssa2 || {};
        const f1Cfg = masterCfg?.assessments?.formative1 || {};
        const f2Cfg = masterCfg?.assessments?.formative2 || {};
        const cia1Cfg = masterCfg?.assessments?.cia1 || {};
        const cia2Cfg = masterCfg?.assessments?.cia2 || {};

        const maxes = {
          ssa1: { co1: Number(ssa1Cfg?.coMax?.co1) || 10, co2: Number(ssa1Cfg?.coMax?.co2) || 10 },
          ssa2: { co3: Number(ssa2Cfg?.coMax?.co3 ?? ssa2Cfg?.coMax?.co1) || 10, co4:Number(ssa2Cfg?.coMax?.co4 ?? ssa2Cfg?.coMax?.co2) || 10 },
          cia1: { co1: Number(cia1Cfg?.coMax?.co1) || 30, co2: Number(cia1Cfg?.coMax?.co2) || 30 },
          cia2: { co3: Number(cia2Cfg?.coMax?.co3 ?? cia2Cfg?.coMax?.co1) || 30, co4: Number(cia2Cfg?.coMax?.co4 ?? cia2Cfg?.coMax?.co2) || 30 },
          f1: { co1: Number(f1Cfg?.maxCo) || 10, co2: Number(f1Cfg?.maxCo) || 10 },
          f2: { co3: Number(f2Cfg?.maxCo) || 10, co4: Number(f2Cfg?.maxCo) || 10 },
        };

        const totals: Record<number, Record<string, { value: number; max: number } | null>> = {};

        students.forEach(student => {
          totals[student.id] = {};

          coNumbers.forEach(coNum => {
            let ssaMark: number | null = null;
            let ssaMax = 0;
            let ciaMark: number | null = null;
            let ciaMax = 0;
            let faMark: number | null = null;
            let faMax = 0;

            if (coNum === 1 || coNum === 2) {
              // Use SSA1, CIA1, Formative1
              const ssa1Total = toNumOrNull(ssa1Res.marks[String(student.id)]);
              const ssa1Half = ssa1Total == null ? null : Number(ssa1Total) / 2;
              ssaMark = ssa1Half;
              ssaMax = coNum === 1 ? maxes.ssa1.co1 : maxes.ssa1.co2;

              // CIA1
              const cia1Data = cia1Res.data;
              if (cia1Data) {
                const cia1ById = cia1Data.rowsByStudentId || {};
                const cia1Row = cia1ById[String(student.id)] || {};
                const questions = cia1Data.questions || [];
                
                ciaMark = 0;
                ciaMax = coNum === 1 ? maxes.cia1.co1 : maxes.cia1.co2;
                
                questions.forEach((q: any) => {
                  const qCo = q.co === '1&2' ? [1, 2] : [Number(q.co)];
                  if (qCo.includes(coNum)) {
                    const mark = toNumOrNull(cia1Row[q.key]);
                    if (mark !== null) {
                      const weight = qCo.length > 1 ? 0.5 : 1;
                      ciaMark = (ciaMark || 0) + (mark * weight);
                    }
                  }
                });
              }

              // Formative1
              const f1Row = (f1Res.marks || {})[String(student.id)] || {};
              // CO1 uses skill1/att1, CO2 uses skill2/att2
              const skillKey = coNum === 1 ? 'skill1' : 'skill2';
              const attKey = coNum === 1 ? 'att1' : 'att2';
              const skill = toNumOrNull(f1Row[skillKey]);
              const att = toNumOrNull(f1Row[attKey]);
              if (skill !== null && att !== null) {
                faMark = skill + att;
                faMax = coNum === 1 ? maxes.f1.co1 : maxes.f1.co2;
              }
            } else if (coNum === 3 || coNum === 4) {
              // Use SSA2, CIA2, Formative2
              const ssa2Total = toNumOrNull(ssa2Res.marks[String(student.id)]);
              const ssa2Half = ssa2Total == null ? null : Number(ssa2Total) / 2;
              ssaMark = ssa2Half;
              ssaMax = coNum === 3 ? maxes.ssa2.co3 : maxes.ssa2.co4;

              // CIA2
              const cia2Data = cia2Res.data;
              if (cia2Data) {
                const cia2ById = cia2Data.rowsByStudentId || {};
                const cia2Row = cia2ById[String(student.id)] || {};
                const questions = cia2Data.questions || [];
                
                ciaMark = 0;
                ciaMax = coNum === 3 ? maxes.cia2.co3 : maxes.cia2.co4;
                
                questions.forEach((q: any) => {
                  const qCo = q.co === '3&4' ? [3, 4] : [Number(q.co)];
                  if (qCo.includes(coNum)) {
                    const mark = toNumOrNull(cia2Row[q.key]);
                    if (mark !== null) {
                      const weight = qCo.length > 1 ? 0.5 : 1;
                      ciaMark = (ciaMark || 0) + (mark * weight);
                    }
                  }
                });
              }

              // Formative2
              const f2Row = (f2Res.marks || {})[String(student.id)] || {};
              // CO3 uses skill1/att1, CO4 uses skill2/att2
              const skillKey = coNum === 3 ? 'skill1' : 'skill2';
              const attKey = coNum === 3 ? 'att1' : 'att2';
              const skill = toNumOrNull(f2Row[skillKey]);
              const att = toNumOrNull(f2Row[attKey]);
              if (skill !== null && att !== null) {
                faMark = skill + att;
                faMax = coNum === 3 ? maxes.f2.co3 : maxes.f2.co4;
              }
            }
            // For CO5, we'd need MODEL marks - skip for now as per requirements

            // Calculate weighted total
            const items = [
              { mark: ssaMark, max: ssaMax, w: weights.ssa },
              { mark: ciaMark, max: ciaMax, w: weights.cia },
              { mark: faMark, max: faMax, w: weights.fa },
            ].filter(it => it.mark !== null && it.max > 0);

            if (items.length > 0) {
              const sumW = items.reduce((s, it) => s + it.w, 0);
              const totalMax = sumW; // Since we're weighting, the max is the sum of weights
              const totalValue = items.reduce((s, it) => {
                const frac = (it.mark as number) / it.max;
                return s + (frac * it.w);
              }, 0);

              totals[student.id][`co${coNum}`] = {
                value: round2(totalValue),
                max: round2(totalMax),
              };
            } else {
              totals[student.id][`co${coNum}`] = null;
            }
          });
        });

        setCoTotals(totals);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to calculate CO totals');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [subjectId, teachingAssignmentId, students, coNumbers, masterCfg]);

  const handleCQIChange = (studentId: number, coKey: string, value: string) => {
    const numValue = value === '' ? null : parseInt(value);
    
    setCqiEntries(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [coKey]: numValue,
      },
    }));
  };

  const handleSave = () => {
    if (!subjectId || !teachingAssignmentId) return;
    
    const key = `cqi_entries_${subjectId}_${teachingAssignmentId}`;
    lsSet(key, cqiEntries);
    alert('CQI entries saved successfully!');
  };

  if (!subjectId || !teachingAssignmentId) {
    return (
      <div style={{ padding: 24, color: '#b91c1c' }}>
        Missing subject ID or teaching assignment ID
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
        Loading CQI data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#b91c1c' }}>
        Error: {error}
      </div>
    );
  }

  if (coNumbers.length === 0) {
    return (
      <div style={{ padding: 24, color: '#b91c1c' }}>
        No course outcomes selected for CQI entry
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 16,
        padding: 16,
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        borderRadius: 12,
        border: '1px solid #bae6fd',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
            CQI Entry - {cos?.join(', ')}
          </h2>
          <div style={{ marginTop: 4, fontSize: 14, color: '#64748b' }}>
            Students below {THRESHOLD_PERCENT}% threshold require CQI intervention
          </div>
        </div>
        <button 
          onClick={handleSave}
          className="obe-btn obe-btn-primary"
          style={{ minWidth: 100 }}
        >
          Save CQI
        </button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 700, color: '#475569', minWidth: 60 }}>
                S.No
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 700, color: '#475569', minWidth: 120 }}>
                Reg No
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 700, color: '#475569', minWidth: 200 }}>
                Name
              </th>
              {coNumbers.map(coNum => (
                <th 
                  key={coNum} 
                  style={{ 
                    padding: '12px 8px', 
                    textAlign: 'center', 
                    fontWeight: 700, 
                    color: '#475569',
                    minWidth: 150,
                  }}
                >
                  CO{coNum}
                  <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
                    Current / Max
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student, idx) => {
              const studentTotals = coTotals[student.id] || {};
              
              return (
                <tr 
                  key={student.id}
                  style={{ 
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb',
                  }}
                >
                  <td style={{ padding: '10px 8px', color: '#64748b' }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: '#0f172a' }}>
                    {student.reg_no}
                  </td>
                  <td style={{ padding: '10px 8px', color: '#0f172a' }}>
                    {student.name}
                  </td>
                  {coNumbers.map(coNum => {
                    const coKey = `co${coNum}`;
                    const coData = studentTotals[coKey];
                    
                    if (!coData) {
                      return (
                        <td 
                          key={coNum}
                          style={{ 
                            padding: '10px 8px', 
                            textAlign: 'center',
                            color: '#94a3b8',
                          }}
                        >
                          —
                        </td>
                      );
                    }

                    const percentage = (coData.value / coData.max) * 100;
                    const isBelowThreshold = percentage < THRESHOLD_PERCENT;
                    const cqiValue = cqiEntries[student.id]?.[coKey];

                    return (
                      <td 
                        key={coNum}
                        style={{ 
                          padding: '10px 8px', 
                          textAlign: 'center',
                          backgroundColor: isBelowThreshold ? '#fef2f2' : '#f0fdf4',
                        }}
                      >
                        <div style={{ 
                          fontSize: 13, 
                          color: '#64748b',
                          marginBottom: 6,
                        }}>
                          {round2(coData.value)} / {round2(coData.max)} ({round2(percentage)}%)
                        </div>
                        {isBelowThreshold ? (
                          <div>
                            <div style={{ 
                              fontSize: 11, 
                              color: '#dc2626', 
                              fontWeight: 600,
                              marginBottom: 4,
                            }}>
                              CO{coNum} Below Threshold
                            </div>
                            <input
                              type="number"
                              value={cqiValue ?? ''}
                              onChange={(e) => handleCQIChange(student.id, coKey, e.target.value)}
                              placeholder="Enter CQI"
                              className="obe-input"
                              style={{
                                width: 90,
                                padding: '4px 8px',
                                fontSize: 13,
                                textAlign: 'center',
                              }}
                            />
                          </div>
                        ) : (
                          <div style={{ 
                            fontSize: 12, 
                            color: '#16a34a',
                            fontWeight: 600,
                          }}>
                            ✓ Meets Threshold
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {students.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: 32,
          color: '#94a3b8',
        }}>
          No students found in this section
        </div>
      )}
    </div>
  );
}
