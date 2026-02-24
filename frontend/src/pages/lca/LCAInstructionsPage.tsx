import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ArticulationMatrixPage from './ArticulationMatrixPage';
import CDAPPage from './CDAPPage';
import LCAPage from './LCAPage';
import COTargetPage from './COTargetPage';

const styles: { [k: string]: React.CSSProperties } = {
  page: {
    padding: 28,
    maxWidth: 1100,
    margin: '18px auto',
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    color: '#1f3947',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 18,
    border: '1px solid #e6eef8',
    boxShadow: '0 6px 20px rgba(13,60,100,0.04)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
  },
  title: { margin: 0, color: '#0b4a6f', fontSize: 22, fontWeight: 700 },
  subtitle: { marginTop: 6, color: '#3d5566', fontSize: 13 },
  meta: { color: '#557085', fontSize: 13, textAlign: 'right' },
  grid: { display: 'grid', gap: 16 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  sectionTitle: { margin: '0 0 10px 0', color: '#0b3b57', fontSize: 16 },
  paragraph: { color: '#334e68', lineHeight: 1.45, margin: 0 },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 8,
  },
  th: {
    background: '#f3f8ff',
    color: '#0b4a6f',
    fontWeight: 700,
    padding: '8px 10px',
    border: '1px solid #e6eef8',
    textAlign: 'center',
    fontSize: 13,
  },
  td: {
    padding: '8px 10px',
    border: '1px solid #eef6fb',
    color: '#234451',
    fontSize: 13,
    textAlign: 'center',
  },
  note: { color: '#6b8190', fontSize: 13 },
  keyValueRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  kv: { background: '#fbfdff', padding: 10, borderRadius: 8, border: '1px solid #e9f3fb', minWidth: 160 },
  kvLabel: { fontSize: 12, color: '#557085', marginBottom: 6 },
  kvValue: { fontWeight: 700, color: '#0b4a6f' },
};

function SmallTable({ title, columns, rows }: { title?: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <div>
      {title && <div style={styles.sectionTitle}>{title}</div>}
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={styles.th}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={styles.td}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TabKey = 'instructions' | 'lca' | 'cdap' | 'articulation' | 'cotarget';

export default function LCAInstructionsPage({
  courseCode,
  courseName,
  initialTab,
  viewerMode,
}: {
  courseCode?: string | null;
  courseName?: string | null;
  initialTab?: TabKey;
  viewerMode?: boolean;
}): JSX.Element {
  const resolvedCourseId = useMemo(() => (courseCode ? String(courseCode) : ''), [courseCode]);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab || 'instructions');

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
  }, [initialTab]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'instructions', label: 'LCA Instructions' },
    { key: 'lca', label: 'LCA' },
    { key: 'cdap', label: 'CDAP' },
    { key: 'articulation', label: 'Articulation Matrix' },
    { key: 'cotarget', label: 'CO Target' },
  ];

    const navBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  };

  const navButton = (key: typeof activeTab, label: string) => {
    const active = activeTab === key;
    const handleClick = () => {
      if (key === 'cotarget') {
        // Render CO Target inline instead of navigating away
        setActiveTab(key);
        return;
      }
      setActiveTab(key);
    };

    return (
      <button
        key={label}
        onClick={handleClick}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          border: active ? '2px solid #0b4a6f' : '1px solid #e6eef8',
          background: active ? '#0b4a6f' : '#fbfdff',
          color: active ? '#fff' : '#0b4a6f',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={styles.page}>
      <div style={{ ...styles.card }}>
        <div style={styles.header}>
          <div style={styles.titleBlock}>
            <h2 style={styles.title}>Learner Centric Approach — Instructions</h2>
            <div style={styles.subtitle}>Default LCA planning matrix and instruction-level guidance for course design and assessment.</div>
          </div>
          {/* meta removed per request */}
        </div>

        <div style={{ padding: 12 }}>
          <div style={navBarStyle}>{tabs.map((t) => navButton(t.key, t.label))}</div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={styles.kv}>
              <div style={styles.kvLabel}>Course</div>
              <div style={styles.kvValue}>{(courseCode ? courseCode : '—') + (courseName ? ` — ${courseName}` : '')}</div>
            </div>
          </div>

          {activeTab === 'instructions' && (
            <div style={styles.grid}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
                <div style={{ ...styles.card, padding: 14, gridColumn: '1 / -1' }}>
                  <div style={styles.sectionTitle}>Overview</div>
                  <p style={styles.paragraph}>
                    Use this page to map learner profiles (L1–L3) to instruction levels (IL-1..IL-3) and to define assessment distribution.
                    The tables below provide recommended mappings and a sample distribution for course planning.
                  </p>

                  <div style={{ marginTop: 12 }}>
                    <SmallTable
                      title="Learner Profile — Quick Guide"
                      columns={["Profile", "Description"]}
                      rows={[
                        ['L1', 'Lower CGPA / limited prerequisites'],
                        ['L2', 'Average preparedness'],
                        ['L3', 'High CGPA / strong prerequisites'],
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div style={{ ...styles.card, padding: 14 }}>
                <div style={styles.sectionTitle}>Instruction Steps (recommended)</div>
                <ol style={{ margin: 0, paddingLeft: 18, color: '#334e68' }}>
                  <li style={{ marginBottom: 8 }}>Identify learner profile (L1 / L2 / L3) for the target offering.</li>
                  <li style={{ marginBottom: 8 }}>Use IL mapping to determine instruction emphasis across IL-1..IL-3.</li>
                  <li style={{ marginBottom: 8 }}>Apply distribution when preparing teaching plan and question banks (map PT / CO / BTL).</li>
                </ol>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ ...styles.card, padding: 12 }}>
                  <div style={styles.sectionTitle}>Sample Assessment Distribution by Learner Profile</div>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Learner Profile</th>
                        <th style={styles.th}>IL-1 %</th>
                        <th style={styles.th}>IL-2 %</th>
                        <th style={styles.th}>IL-3 %</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={styles.td}>L1</td>
                        <td style={styles.td}>60</td>
                        <td style={styles.td}>30</td>
                        <td style={styles.td}>10</td>
                      </tr>
                      <tr>
                        <td style={styles.td}>L2</td>
                        <td style={styles.td}>30</td>
                        <td style={styles.td}>50</td>
                        <td style={styles.td}>20</td>
                      </tr>
                      <tr>
                        <td style={styles.td}>L3</td>
                        <td style={styles.td}>10</td>
                        <td style={styles.td}>40</td>
                        <td style={styles.td}>50</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ ...styles.card, padding: 12 }}>
                  <div style={styles.sectionTitle}>Current Course — Example Breakdown</div>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Component</th>
                        <th style={styles.th}>IL-1</th>
                        <th style={styles.th}>IL-2</th>
                        <th style={styles.th}>IL-3</th>
                        <th style={styles.th}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={styles.td}>Teaching Hours</td>
                        <td style={styles.td}>40%</td>
                        <td style={styles.td}>40%</td>
                        <td style={styles.td}>20%</td>
                        <td style={styles.td}>Blend of lectures and labs</td>
                      </tr>
                      <tr>
                        <td style={styles.td}>Question Bank</td>
                        <td style={styles.td}>50%</td>
                        <td style={styles.td}>30%</td>
                        <td style={styles.td}>20%</td>
                        <td style={styles.td}>Adjust difficulty by profile</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10 }}>
                    <div style={styles.note}>Tip: Use these templates as starting points and adapt percentages to the specific cohort.</div>
                  </div>
                </div>

                <div style={{ ...styles.card, padding: 12 }}>
                  <div style={styles.sectionTitle}>IL Mapping</div>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>IL</th>
                        <th style={styles.th}>Instruction Focus</th>
                        <th style={styles.th}>Typical Assessment Emphasis</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={styles.td}>IL-1</td>
                        <td style={styles.td}>Foundation, concepts, scaffolding</td>
                        <td style={styles.td}>More formative; MCQ / guided tasks</td>
                      </tr>
                      <tr>
                        <td style={styles.td}>IL-2</td>
                        <td style={styles.td}>Application and practice</td>
                        <td style={styles.td}>Mixture of practical and theory</td>
                      </tr>
                      <tr>
                        <td style={styles.td}>IL-3</td>
                        <td style={styles.td}>Advanced, synthesis, independent work</td>
                        <td style={styles.td}>Problem-solving, projects, high-level questions</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'lca' && (
            <fieldset disabled={Boolean(viewerMode)} style={{ border: 0, padding: 0, margin: 0 }}>
              {resolvedCourseId ? (
                <LCAPage embedded={true} courseId={resolvedCourseId} courseCode={resolvedCourseId} courseName={courseName ?? undefined} />
              ) : (
                <div style={{ ...styles.card, padding: 16 }}>
                  <div style={styles.sectionTitle}>LCA</div>
                  <div style={styles.paragraph}>Select a course to view the LCA worksheet.</div>
                </div>
              )}
            </fieldset>
          )}

          {activeTab === 'cdap' && (
            <fieldset disabled={Boolean(viewerMode)} style={{ border: 0, padding: 0, margin: 0 }}>
              {resolvedCourseId ? (
                <div style={{ ...styles.card, padding: 12 }}>
                  <CDAPPage courseId={resolvedCourseId} showHeader={false} showCourseInput={false} />
                </div>
              ) : (
                <div style={{ ...styles.card, padding: 16 }}>
                  <div style={styles.sectionTitle}>CDAP</div>
                  <div style={styles.paragraph}>Select a course to open CDAP.</div>
                </div>
              )}
            </fieldset>
          )}

          {activeTab === 'articulation' && (
            <fieldset disabled={Boolean(viewerMode)} style={{ border: 0, padding: 0, margin: 0 }}>
              {resolvedCourseId ? (
                <ArticulationMatrixPage embedded={true} courseId={resolvedCourseId} />
              ) : (
                <div style={{ ...styles.card, padding: 16 }}>
                  <div style={styles.sectionTitle}>Articulation Matrix</div>
                  <div style={styles.paragraph}>Select a course to view the articulation matrix.</div>
                </div>
              )}
            </fieldset>
          )}

          {activeTab === 'cotarget' && (
            <fieldset disabled={Boolean(viewerMode)} style={{ border: 0, padding: 0, margin: 0 }}>
              {resolvedCourseId ? (
                <div style={{ ...styles.card, padding: 12 }}>
                  <COTargetPage
                    embedded={true}
                    courseCode={resolvedCourseId}
                    courseName={courseName ?? undefined}
                    onClose={() => setActiveTab('instructions')}
                  />
                </div>
              ) : (
                <div style={{ ...styles.card, padding: 16 }}>
                  <div style={styles.sectionTitle}>CO Target</div>
                  <div style={styles.paragraph}>Select a course to view CO Targets.</div>
                </div>
              )}
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}
