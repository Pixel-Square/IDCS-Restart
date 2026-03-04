import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export const RANGES = [
  { label: '0 TO 9',    min: 0,  max: 9   },
  { label: '10 TO 19',  min: 10, max: 19  },
  { label: '20 TO 29',  min: 20, max: 29  },
  { label: '30 TO 39',  min: 30, max: 39  },
  { label: '40 TO 44',  min: 40, max: 44  },
  { label: '45 TO 49',  min: 45, max: 49  },
  { label: '50 TO 54',  min: 50, max: 54  },
  { label: '55 TO 59',  min: 55, max: 59  },
  { label: '60 TO 69',  min: 60, max: 69  },
  { label: '70 TO 79',  min: 70, max: 79  },
  { label: '80 TO 89',  min: 80, max: 89  },
  { label: '90 TO 100', min: 90, max: 100 },
];

type Props = {
  totals: number[];
  loading?: boolean;
  cycleName?: string;
};

export function computeRangeCounts(totals: number[]) {
  return RANGES.map((r) => ({
    label: r.label,
    count: totals.filter((v) => v >= r.min && v <= r.max).length,
  }));
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '8px 14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 700, color: '#374151' }}>{label}</div>
        <div style={{ color: '#2563eb', marginTop: 2 }}>
          {payload[0].value} student{payload[0].value !== 1 ? 's' : ''}
        </div>
      </div>
    );
  }
  return null;
};

export default function BellGraphPage({ totals, loading, cycleName }: Props): JSX.Element {
  const chartData = useMemo(() => computeRangeCounts(totals), [totals]);
  const maxCount = useMemo(
    () => Math.max(1, ...chartData.map((d) => d.count)),
    [chartData],
  );

  const totalStudents = totals.length;
  const avg =
    totalStudents > 0
      ? Math.round(totals.reduce((a, b) => a + b, 0) / totalStudents)
      : null;
  const highest = totalStudents > 0 ? Math.max(...totals) : null;
  const lowest = totalStudents > 0 ? Math.min(...totals) : null;
  const passCount = totals.filter((v) => v >= 50).length;

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#6b7280', textAlign: 'center' }}>
        Loading distribution…
      </div>
    );
  }

  if (totalStudents === 0) {
    return (
      <div style={{ padding: 32, color: '#6b7280', textAlign: 'center' }}>
        No marks data available to plot.
      </div>
    );
  }

  return (
    <div>
      {/* Summary Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 12,
          marginBottom: 28,
        }}
      >
        {[
          { label: 'Total Students', value: totalStudents, color: '#2563eb' },
          { label: 'Class Average', value: avg !== null ? `${avg}` : '—', color: '#059669' },
          { label: 'Highest', value: highest !== null ? highest : '—', color: '#7c3aed' },
          { label: 'Lowest', value: lowest !== null ? lowest : '—', color: '#dc2626' },
          {
            label: 'Pass Rate',
            value: totalStudents > 0 ? `${Math.round((passCount / totalStudents) * 100)}%` : '—',
            color: '#d97706',
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: '12px 16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontWeight: 600 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: '20px 8px 8px',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12, paddingLeft: 16 }}>
          Score Distribution — {cycleName || 'Total / 100'}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 40 }}>
            <defs>
              <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#4b5563', fontWeight: 600 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              dy={4}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              domain={[0, Math.ceil(maxCount * 1.2)]}
              label={{
                value: 'No. of Students',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: '#9ca3af' },
                dx: 12,
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#2563eb"
              strokeWidth={2.5}
              fill="url(#bellGrad)"
              dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#1d4ed8' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
