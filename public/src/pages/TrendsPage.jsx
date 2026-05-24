import React from 'react';
import { useNews } from '../NewsContext';
import { CAT_COLORS } from '../utils';

function TrendList({ items, colors }) {
  const max = items[0]?.count || 1;
  return (
    <div className="trend-list">
      {items.map((item, i) => (
        <div className="trend-row" key={item.name}>
          <span className="trend-label" title={item.name}>{item.name}</span>
          <div className="trend-track">
            <div
              className="trend-fill"
              style={{
                width: `${Math.round((item.count / max) * 100)}%`,
                background: colors ? (colors[i] || '#888') : '#378add',
              }}
            />
          </div>
          <span className="trend-count">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendsPage() {
  const { categoryStats, sourceStats, dateStats, articles, loading } = useNews();

  if (loading && articles.length === 0) {
    return (
      <div className="analytics-page">
        <div className="loading-wrap"><span className="spin">↻</span> Loading trends...</div>
      </div>
    );
  }

  const catColors = categoryStats.map(s => CAT_COLORS[s.name] || '#888');

  // Most active day
  const topDay = [...dateStats].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="analytics-page">
      <h1 className="page-title">📈 Trends</h1>

      {/* Summary strip */}
      <div className="stats-row" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-label">Leading topic</div>
          <div className="stat-val sm">{categoryStats[0]?.name || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Most active source</div>
          <div className="stat-val sm">{sourceStats[0]?.name || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Busiest day</div>
          <div className="stat-val sm">{topDay?.date || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total articles</div>
          <div className="stat-val">{articles.length}</div>
        </div>
      </div>

      {/* Category trend */}
      <div className="chart-card" style={{ marginBottom: 12 }}>
        <div className="chart-title">Category popularity</div>
        <TrendList items={categoryStats} colors={catColors} />
      </div>

      {/* Source trend */}
      <div className="chart-card" style={{ marginBottom: 12 }}>
        <div className="chart-title">Top sources by volume</div>
        <TrendList items={sourceStats.slice(0, 10)} colors={null} />
      </div>

      {/* Date trend */}
      {dateStats.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">Articles by date</div>
          <TrendList items={dateStats} colors={null} />
        </div>
      )}
    </div>
  );
}
