import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line
} from 'recharts';
import { useNews } from '../NewsContext';
import { CAT_COLORS } from '../utils';

const SOURCE_COLOR = '#378add';
const DATE_COLOR   = '#1d9e75';

/* Custom tooltip to match the site's neutral palette */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e4', borderRadius: 8,
      padding: '6px 12px', fontSize: 12, color: '#333', boxShadow: '0 2px 8px rgba(0,0,0,.08)'
    }}>
      <strong>{label || payload[0]?.name}</strong>
      <div>{payload[0]?.value} articles</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { articles, categoryStats, sourceStats, dateStats, loading } = useNews();

  if (loading && articles.length === 0) {
    return (
      <div className="analytics-page">
        <div className="loading-wrap"><span className="spin">↻</span> Loading analytics...</div>
      </div>
    );
  }

  const topCategory = categoryStats[0]?.name || '—';
  const topSource   = sourceStats[0]?.name   || '—';

  /* Pie data — category */
  const pieData = categoryStats.map(s => ({ name: s.name, value: s.count }));

  /* Bar data — sources (top 8) */
  const sourceBar = sourceStats.slice(0, 8);

  /* Line data — articles by date */
  const dateBar = dateStats.slice(0, 10);

  return (
    <div className="analytics-page">
      <h1 className="page-title">📊 Analytics</h1>

      {/* Stat cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Articles</div>
          <div className="stat-val">{articles.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Categories</div>
          <div className="stat-val">{categoryStats.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Category</div>
          <div className="stat-val sm">{topCategory}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Source</div>
          <div className="stat-val sm">{topSource}</div>
        </div>
      </div>

      {/* Pie + Category bar */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">Articles by Category</div>

          {/* Pie legend */}
          <div className="pie-legend">
            {pieData.map((d, i) => (
              <div className="leg-item" key={d.name}>
                <div className="leg-dot" style={{ background: CAT_COLORS[d.name] || '#888' }} />
                {d.name}
              </div>
            ))}
          </div>

          <div className="chart-inner" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={CAT_COLORS[entry.name] || '#888'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Category Volume</div>
          <div className="chart-inner" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryStats} layout="vertical" margin={{ left: 80, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ef" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f5f4' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {categoryStats.map((entry, i) => (
                    <Cell key={i} fill={CAT_COLORS[entry.name] || '#888'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Sources bar */}
      <div className="chart-card" style={{ marginBottom: 12 }}>
        <div className="chart-title">Top News Sources</div>
        <div className="chart-inner" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sourceBar} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ef" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f5f4' }} />
              <Bar dataKey="count" fill={SOURCE_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Date line */}
      {dateBar.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">Articles by Date</div>
          <div className="chart-inner" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dateBar} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ef" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone" dataKey="count" stroke={DATE_COLOR}
                  strokeWidth={2} dot={{ r: 3, fill: DATE_COLOR }} activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}