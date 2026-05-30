import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { getQuestionBankLogs, QuestionBankLog } from '../../services/questionBank';

export default function IQACQuestionBankLogsPage(): JSX.Element {
  const { courseCode } = useParams<{ courseCode: string }>();
  const code = useMemo(() => decodeURIComponent(String(courseCode || '')).trim(), [courseCode]);
  
  const [logs, setLogs] = useState<QuestionBankLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    loadLogs();
  }, [code]);

  async function loadLogs() {
    try {
      setLoading(true);
      setError(null);
      const logsData = await getQuestionBankLogs(code);
      setLogs(logsData);
    } catch (e: any) {
      setError(e.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  function renderLogDetails(log: QuestionBankLog): string {
    if (log.action === 'created') {
      return `Question #${log.question_bank} created`;
    }
    if (log.action === 'finalized') {
      return 'Question bank finalized for all faculties';
    }
    if (log.action === 'updated') {
      const changes: string[] = [];
      const oldVals = log.old_values || {};
      const newVals = log.new_values || {};
      
      const fieldLabels: Record<string, string> = {
        question_text: 'Question',
        course_outcome: 'CO',
        part: 'Part',
        btl: 'BTL',
        marks: 'Marks',
      };

      for (const key of Object.keys(fieldLabels)) {
        const oldVal = oldVals[key];
        const newVal = newVals[key];
        if (oldVal !== newVal) {
          const label = fieldLabels[key];
          changes.push(`${label}: ${oldVal !== null && oldVal !== undefined ? oldVal : '-'} → ${newVal !== null && newVal !== undefined ? newVal : '-'}`);
        }
      }
      
      return changes.length > 0 ? changes.join(', ') : 'Updated';
    }
    return '';
  }

  return (
    <main style={{ padding: 18, minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Question Bank Activity Logs</h2>
        <div style={{ color: '#6b7280', marginTop: 6 }}>Track faculty edits and finalizations for {code}</div>
      </div>

      {error && (
        <div style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: 6,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          color: '#991b1b',
        }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6b7280', padding: '40px', textAlign: 'center' }}>Loading...</div>
      ) : logs.length === 0 ? (
        <div style={{ color: '#6b7280', padding: '40px', textAlign: 'center' }}>
          No activity logs yet.
        </div>
      ) : (
        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: '#fff',
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  width: '120px',
                }}>
                  Action
                </th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                }}>
                  Faculty Member
                </th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  width: '200px',
                }}>
                  Timestamp
                </th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                }}>
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => (
                <tr
                  key={log.id}
                  style={{
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#fff',
                  }}
                >
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: log.action === 'finalized'
                        ? '#dcfce7'
                        : log.action === 'created'
                          ? '#dbeafe'
                          : '#fef3c7',
                      color: log.action === 'finalized'
                        ? '#166534'
                        : log.action === 'created'
                          ? '#1e40af'
                          : '#92400e',
                    }}>
                      {log.action.toUpperCase()}
                    </span>
                  </td>
                  <td style={{
                    padding: '12px',
                    fontWeight: '500',
                    color: '#111827',
                  }}>
                    {log.edited_by_name || 'Unknown'}
                  </td>
                  <td style={{
                    padding: '12px',
                    color: '#6b7280',
                    whiteSpace: 'nowrap',
                    fontSize: '13px',
                  }}>
                    {new Date(log.edited_at).toLocaleString()}
                  </td>
                  <td style={{
                    padding: '12px',
                    color: '#6b7280',
                    fontSize: '13px',
                    maxWidth: '400px',
                  }}>
                    {renderLogDetails(log)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
            borderTop: '1px solid #e5e7eb',
            fontSize: '13px',
            color: '#6b7280',
          }}>
            Total activities: <strong>{logs.length}</strong>
          </div>
        </div>
      )}

      {/* Summary Section */}
      {!loading && logs.length > 0 && (
        <div style={{
          marginTop: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          {[
            {
              label: 'Total Activities',
              value: logs.length.toString(),
              color: '#6b7280',
            },
            {
              label: 'Questions Created',
              value: logs.filter(l => l.action === 'created').length.toString(),
              color: '#3b82f6',
            },
            {
              label: 'Updates Made',
              value: logs.filter(l => l.action === 'updated').length.toString(),
              color: '#f59e0b',
            },
            {
              label: 'Finalizations',
              value: logs.filter(l => l.action === 'finalized').length.toString(),
              color: '#10b981',
            },
          ].map((stat, idx) => (
            <div
              key={idx}
              style={{
                padding: '16px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#fff',
              }}
            >
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
