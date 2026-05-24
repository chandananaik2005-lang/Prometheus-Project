import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNews } from '../NewsContext';
import { getCatClass, formatDate } from '../utils';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { history, clearHistory, removeFromHistory, bookmarks } = useNews();
  const [confirmClear, setConfirmClear] = useState(false);
  const [activeTab, setActiveTab]       = useState('history');

  const handleClear = () => {
    if (confirmClear) {
      clearHistory();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>⚙️ Settings</h1>
          <p style={{ fontSize: 13, color: '#888' }}>Manage your reading history and preferences</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📚 Research History
          {history.length > 0 && <span className="tab-badge">{history.length}</span>}
        </button>
        <button
          className={`settings-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          📊 Reading Stats
        </button>
      </div>

      {/* ── History Tab ─────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <span className="settings-section-title">Research History</span>
              <span className="settings-section-sub">
                {history.length === 0
                  ? 'Articles you open will appear here automatically.'
                  : `${history.length} article${history.length !== 1 ? 's' : ''} opened`}
              </span>
            </div>
            {history.length > 0 && (
              <button className="danger-btn" onClick={handleClear}>
                {confirmClear ? '⚠️ Confirm clear' : '🗑 Clear history'}
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="empty-state-card">
              <div className="empty-state-icon">📖</div>
              <h3>No reading history yet</h3>
              <p>Every article you open is automatically saved here so you can track your research.</p>
              <button className="search-btn" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
                Browse articles →
              </button>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item, i) => (
                <div
                  className="history-item"
                  key={`${item.id}-${i}`}
                  onClick={() => navigate(`/article/${item.id}`)}
                >
                  {item.image && (
                    <img
                      className="history-thumb"
                      src={item.image}
                      alt=""
                      onError={e => (e.target.style.display = 'none')}
                    />
                  )}
                  <div className="history-body">
                    <div className="history-meta-row">
                      <span className={`cat-badge ${getCatClass(item.category)}`}>{item.category}</span>
                      <span className="history-time">{timeAgo(item.openedAt)}</span>
                    </div>
                    <div className="history-title">{item.title}</div>
                    <div className="history-source">
                      <span>📰 {item.source}</span>
                      {item.pubDate && <span>· {formatDate(item.pubDate)}</span>}
                    </div>
                  </div>
                  <button
                    className="history-remove-btn"
                    onClick={e => { e.stopPropagation(); removeFromHistory(item.id); }}
                    title="Remove from history"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Stats Tab ───────────────────────────────────────────── */}
      {activeTab === 'stats' && (
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">Reading Stats</span>
          </div>

          <div className="stats-row" style={{ marginBottom: '1.25rem' }}>
            <div className="stat-card">
              <div className="stat-label">Articles read</div>
              <div className="stat-val">{history.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Bookmarked</div>
              <div className="stat-val">{bookmarks.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Fav category</div>
              <div className="stat-val sm">{getFavCategory(history) || '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Fav source</div>
              <div className="stat-val sm">{getFavSource(history) || '—'}</div>
            </div>
          </div>

          {history.length > 0 && (
            <>
              <div className="chart-card" style={{ marginBottom: 12 }}>
                <div className="chart-title">Categories you've read</div>
                <CategoryBreakdown history={history} />
              </div>
              <div className="chart-card">
                <div className="chart-title">Sources you've read</div>
                <SourceBreakdown history={history} />
              </div>
            </>
          )}

          {history.length === 0 && (
            <div className="empty-state-card">
              <div className="empty-state-icon">📊</div>
              <h3>No data yet</h3>
              <p>Start reading articles and your stats will appear here.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────
function countBy(arr, key) {
  const c = {};
  arr.forEach(a => { const v = a[key] || 'Unknown'; c[v] = (c[v] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

function getFavCategory(history) {
  return countBy(history, 'category')[0]?.[0];
}

function getFavSource(history) {
  return countBy(history, 'source')[0]?.[0];
}

function CategoryBreakdown({ history }) {
  const data = countBy(history, 'category');
  const max  = data[0]?.[1] || 1;
  return (
    <div className="trend-list">
      {data.slice(0, 8).map(([name, count]) => (
        <div className="trend-row" key={name}>
          <span className="trend-label" title={name}>{name}</span>
          <div className="trend-track">
            <div
              className="trend-fill"
              style={{ width: `${Math.round((count / max) * 100)}%`, background: '#e24b4a' }}
            />
          </div>
          <span className="trend-count">{count}</span>
        </div>
      ))}
    </div>
  );
}

function SourceBreakdown({ history }) {
  const data = countBy(history, 'source');
  const max  = data[0]?.[1] || 1;
  return (
    <div className="trend-list">
      {data.slice(0, 8).map(([name, count]) => (
        <div className="trend-row" key={name}>
          <span className="trend-label" title={name}>{name}</span>
          <div className="trend-track">
            <div
              className="trend-fill"
              style={{ width: `${Math.round((count / max) * 100)}%`, background: '#378add' }}
            />
          </div>
          <span className="trend-count">{count}</span>
        </div>
      ))}
    </div>
  );
}