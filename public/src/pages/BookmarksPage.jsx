import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNews } from '../NewsContext';
import NewsCard from '../components/NewsCard';

export default function BookmarksPage() {
  const { bookmarks, clearBookmarks, toggleBookmark } = useNews();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => {
    if (!searchInput.trim()) return bookmarks;
    const q = searchInput.toLowerCase();
    return bookmarks.filter(
      b => b.title?.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q)
    );
  }, [bookmarks, searchInput]);

  const handleClear = () => {
    if (confirmClear) {
      clearBookmarks();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>🔖 Bookmarks</h1>
          <p style={{ fontSize: 13, color: '#888' }}>
            {bookmarks.length === 0
              ? 'No bookmarks yet — save articles to read them later.'
              : `${bookmarks.length} saved article${bookmarks.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {bookmarks.length > 0 && (
          <button
            className="danger-btn"
            onClick={handleClear}
          >
            {confirmClear ? '⚠️ Confirm clear all' : '🗑 Clear all'}
          </button>
        )}
      </div>

      {/* Search */}
      {bookmarks.length > 0 && (
        <div className="search-row" style={{ marginBottom: '1rem' }}>
          <input
            className="search-input"
            placeholder="Search bookmarks..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              className="search-btn"
              style={{ background: '#888' }}
              onClick={() => setSearchInput('')}
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {bookmarks.length === 0 && (
        <div className="empty-state-card">
          <div className="empty-state-icon">🔖</div>
          <h3>No bookmarks yet</h3>
          <p>Open any article and click the <strong>Bookmark</strong> button to save it here for later.</p>
          <button className="search-btn" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
            Browse articles →
          </button>
        </div>
      )}

      {/* No search results */}
      {bookmarks.length > 0 && filtered.length === 0 && (
        <div className="empty">No bookmarks match your search.</div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="news-grid">
          {filtered.map(article => (
            <div key={article.id} style={{ position: 'relative' }}>
              <NewsCard article={article} />
              <button
                className="remove-bookmark-btn"
                onClick={e => { e.stopPropagation(); toggleBookmark(article); }}
                title="Remove bookmark"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}