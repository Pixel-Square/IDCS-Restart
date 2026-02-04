import React, { useMemo, useState } from 'react';

type NumberInputProps = {
  value: number | '';
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
};

function NumberInput({ value, onChange, min, max }: NumberInputProps): JSX.Element {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') {
          onChange('');
        } else {
          onChange(Number(v));
        }
      }}
      min={min}
      max={max}
      style={{
        width: 80,
        padding: '4px 6px',
        borderRadius: 4,
        border: '1px solid #d1d5db',
      }}
    />
  );
}

type BandCounts = {
  low: number | '';
  medium: number | '';
  high: number | '';
};

type PrerequisiteRow = {
  name: string;
  level: number | '';
};

function classifyLevelFromBand(counts: BandCounts): 'Low' | 'Medium' | 'High' | '-' {
  const low = typeof counts.low === 'number' ? counts.low : 0;
  const medium = typeof counts.medium === 'number' ? counts.medium : 0;
  const high = typeof counts.high === 'number' ? counts.high : 0;
  const total = low + medium + high;
  if (!total) return '-';
  const max = Math.max(low, medium, high);
  if (max === low) return 'Low';
  if (max === medium) return 'Medium';
  return 'High';
}

function mapLevelToCode(level: 'Low' | 'Medium' | 'High' | '-'): 'LL' | 'ML' | 'HL' | '-' {
  if (level === 'Low') return 'LL';
  if (level === 'Medium') return 'ML';
  if (level === 'High') return 'HL';
  return '-';
}

export default function LCAPage({ courseId }: { courseId?: string }): JSX.Element {
  const [currentGpaCounts, setCurrentGpaCounts] = useState<BandCounts>({ low: '', medium: '', high: '' });
  const [prerequisites, setPrerequisites] = useState<PrerequisiteRow[]>([
    { name: 'Prerequisite 1', level: '' },
    { name: 'Prerequisite 2', level: '' },
    { name: 'Prerequisite 3', level: '' },
    { name: 'Prerequisite 4', level: '' },
  ]);
  const [previousBatchResult, setPreviousBatchResult] = useState<number | ''>('');

  const gpaLevel = useMemo(() => classifyLevelFromBand(currentGpaCounts), [currentGpaCounts]);
  const gpaLevelCode = useMemo(() => mapLevelToCode(gpaLevel), [gpaLevel]);

  const prereqAverage = useMemo(() => {
    const numeric = prerequisites.map((p) => (typeof p.level === 'number' ? p.level : null)).filter((v) => v !== null) as number[];
    if (!numeric.length) return '';
    const sum = numeric.reduce((acc, v) => acc + v, 0);
    return Number((sum / numeric.length).toFixed(2));
  }, [prerequisites]);

  const prereqLevel: 'Low' | 'Medium' | 'High' | '-' = useMemo(() => {
    if (prereqAverage === '') return '-';
    if (prereqAverage < 2) return 'Low';
    if (prereqAverage < 3) return 'Medium';
    return 'High';
  }, [prereqAverage]);

  const [instructionLevel, setInstructionLevel] = useState<number | ''>('');
  const [activityLevel, setActivityLevel] = useState<number | ''>('');

  const learnerCentricLevel = useMemo(() => {
    if (typeof instructionLevel !== 'number' || typeof activityLevel !== 'number') return '';
    return Number((instructionLevel + activityLevel).toFixed(1));
  }, [instructionLevel, activityLevel]);

  const [ilMetrics, setIlMetrics] = useState({
    category1: '' as number | '',
    category2: '' as number | '',
    category3: '' as number | '',
  });

  const ilTotal = useMemo(() => {
    const v1 = typeof ilMetrics.category1 === 'number' ? ilMetrics.category1 : 0;
    const v2 = typeof ilMetrics.category2 === 'number' ? ilMetrics.category2 : 0;
    const v3 = typeof ilMetrics.category3 === 'number' ? ilMetrics.category3 : 0;
    const total = v1 + v2 + v3;
    return total ? total : '';
  }, [ilMetrics]);

  const [teacherEffort, setTeacherEffort] = useState({
    category1: '' as number | '',
    category2: '' as number | '',
    category3: '' as number | '',
  });

  const teacherTotalHours = useMemo(() => {
    const v1 = typeof teacherEffort.category1 === 'number' ? teacherEffort.category1 : 0;
    const v2 = typeof teacherEffort.category2 === 'number' ? teacherEffort.category2 : 0;
    const v3 = typeof teacherEffort.category3 === 'number' ? teacherEffort.category3 : 0;
    const total = v1 + v2 + v3;
    return total ? total : '';
  }, [teacherEffort]);

  const learnerLevelSummary = useMemo(() => {
    if (gpaLevel === '-' && prereqLevel === '-') return '-';
    if (gpaLevel === 'Low' || prereqLevel === 'Low') return 'Low';
    if (gpaLevel === 'High' && prereqLevel === 'High') return 'High';
    return 'Medium';
  }, [gpaLevel, prereqLevel]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Learner Centric Approach (LCA)</h2>
      <div style={{ color: '#444', marginBottom: 16 }}>
        Structured LCA worksheet for {courseId || 'this course'}. Enter values in the yellow cells; computed fields will update
        automatically.
      </div>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '8px 0' }}>Step 1: Identifying Learner Profile</h3>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Enter class profile; bands and levels are calculated.</div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>1.1 Current GPA Profile (CGP)</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Low band</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Medium band</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>High band</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Level</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Code</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>Number of students in GPA band</td>
                <td style={{ padding: 8, background: '#fef9c3' }}>
                  <NumberInput
                    value={currentGpaCounts.low}
                    onChange={(v) => setCurrentGpaCounts((prev) => ({ ...prev, low: v }))}
                  />
                </td>
                <td style={{ padding: 8, background: '#fef9c3' }}>
                  <NumberInput
                    value={currentGpaCounts.medium}
                    onChange={(v) => setCurrentGpaCounts((prev) => ({ ...prev, medium: v }))}
                  />
                </td>
                <td style={{ padding: 8, background: '#fef9c3' }}>
                  <NumberInput
                    value={currentGpaCounts.high}
                    onChange={(v) => setCurrentGpaCounts((prev) => ({ ...prev, high: v }))}
                  />
                </td>
                <td style={{ padding: 8, textAlign: 'center', color: '#111827' }}>{gpaLevel}</td>
                <td style={{ padding: 8, textAlign: 'center', color: '#111827' }}>{gpaLevelCode}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ height: 12 }} />

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>1.2 Prerequisite Profile (PRP)</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Level (1-4)</th>
              </tr>
            </thead>
            <tbody>
              {prerequisites.map((row, idx) => (
                <tr key={row.name}>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>{row.name}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', background: '#fef9c3', textAlign: 'center' }}>
                    <NumberInput
                      value={row.level}
                      onChange={(v) => {
                        setPrerequisites((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], level: v };
                          return next;
                        });
                      }}
                      min={1}
                      max={4}
                    />
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f9fafb' }}>
                <td style={{ padding: 8 }}>Average level</td>
                <td style={{ padding: 8, textAlign: 'center' }}>{prereqAverage === '' ? '-' : prereqAverage}</td>
              </tr>
              <tr style={{ background: '#f9fafb' }}>
                <td style={{ padding: 8 }}>Standardized learner profile level</td>
                <td style={{ padding: 8, textAlign: 'center' }}>{prereqLevel}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
          <div
            style={{
              padding: 10,
              borderRadius: 6,
              background: '#ecfdf3',
              border: '1px solid #bbf7d0',
              fontSize: 13,
              flex: 1,
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Learner profile summary</div>
            <div style={{ color: '#166534' }}>Overall learner level: {learnerLevelSummary}</div>
          </div>
          <div
            style={{
              padding: 10,
              borderRadius: 6,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              fontSize: 13,
              flex: 1,
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 4 }}>1.3 Previous Batch Result (PBR)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Pass percentage</span>
              <NumberInput
                value={previousBatchResult}
                onChange={setPreviousBatchResult}
                min={0}
                max={100}
              />
              <span>%</span>
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '8px 0' }}>Step 2: Instruction Level (IL) and Activity Level (AL)</h3>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Define instruction and activity intensities; LCL = IL + AL.</div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Instruction Level (IL)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>Planned instruction level</span>
              <NumberInput
                value={instructionLevel}
                onChange={setInstructionLevel}
                min={0}
                max={4}
              />
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>0-1: basic, 2-3: moderate, 4+: advanced/innovative.</div>
          </div>
          <div style={{ flex: 1, minWidth: 260, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Activity Level (AL)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>Planned learner activity level</span>
              <NumberInput
                value={activityLevel}
                onChange={setActivityLevel}
                min={0}
                max={4}
              />
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Higher values indicate more learner-centred activities.</div>
          </div>
          <div style={{ flexBasis: '100%' }} />
          <div style={{ flex: 1, minWidth: 260, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#f9fafb' }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Learner Centric Level (LCL)</div>
            <div style={{ fontSize: 13 }}>LCL = IL + AL</div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 600, color: '#2563eb' }}>
              {learnerCentricLevel === '' ? '-' : learnerCentricLevel}
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '8px 0' }}>Step 3: IL Metrics</h3>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Distribute IL across metrics such as coverage, depth and assessment.</div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Category</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Planned IL weight</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>Coverage of syllabus</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', background: '#fef9c3', textAlign: 'center' }}>
                  <NumberInput
                    value={ilMetrics.category1}
                    onChange={(v) => setIlMetrics((prev) => ({ ...prev, category1: v }))}
                  />
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>Depth / higher-order learning</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', background: '#fef9c3', textAlign: 'center' }}>
                  <NumberInput
                    value={ilMetrics.category2}
                    onChange={(v) => setIlMetrics((prev) => ({ ...prev, category2: v }))}
                  />
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>Assessment and feedback</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', background: '#fef9c3', textAlign: 'center' }}>
                  <NumberInput
                    value={ilMetrics.category3}
                    onChange={(v) => setIlMetrics((prev) => ({ ...prev, category3: v }))}
                  />
                </td>
              </tr>
              <tr style={{ background: '#f9fafb' }}>
                <td style={{ padding: 8 }}>Total planned IL</td>
                <td style={{ padding: 8, textAlign: 'center' }}>{ilTotal === '' ? '-' : ilTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '8px 0' }}>Step 4: Instruction and Learning Methodology</h3>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
          Plan teacher effort and assessment components for lectures (L), tutorials (T), projects (PR) and assignments (AS).
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Category</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Planned no. of hours</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>PT1</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>CIA1</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>PT2</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>CIA2</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>PT3</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>CIA3</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>Category 1 (L/T)</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', background: '#fef9c3' }}>
                  <NumberInput
                    value={teacherEffort.category1}
                    onChange={(v) => setTeacherEffort((prev) => ({ ...prev, category1: v }))}
                  />
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }} colSpan={6}>
                  <span style={{ color: '#6b7280' }}>Distribute across tests and CIAs as per assessment plan.</span>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }} />
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>Category 2 (PR/AS)</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', background: '#fef9c3' }}>
                  <NumberInput
                    value={teacherEffort.category2}
                    onChange={(v) => setTeacherEffort((prev) => ({ ...prev, category2: v }))}
                  />
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }} colSpan={6}>
                  <span style={{ color: '#6b7280' }}>Project / assignment related activities with question bank support.</span>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }} />
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>Category 3 (Other IL)</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', background: '#fef9c3' }}>
                  <NumberInput
                    value={teacherEffort.category3}
                    onChange={(v) => setTeacherEffort((prev) => ({ ...prev, category3: v }))}
                  />
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }} colSpan={6}>
                  <span style={{ color: '#6b7280' }}>Seminars, flipped classroom, peer learning, etc.</span>
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }} />
              </tr>
              <tr style={{ background: '#f9fafb' }}>
                <td style={{ padding: 8 }}>Total teacher effort hours</td>
                <td style={{ padding: 8, textAlign: 'center' }}>{teacherTotalHours === '' ? '-' : teacherTotalHours}</td>
                <td style={{ padding: 8 }} colSpan={7}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Use this section to align IL/AL with continuous assessment and question bank planning.
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
