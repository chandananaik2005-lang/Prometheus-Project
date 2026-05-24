import React, { useState, useMemo } from 'react';
import { useNews } from '../NewsContext';
import NewsCard from '../components/NewsCard';

export default function NewsFeedPage() {
  const {
    articles, loading, error, nextPage, loadMore,
    globalSearch, searchResults, searchLoading, clearSearch,
  } = useNews();

  const [activeFilter, setActiveFilter] = useState('All');

  // When a global search is active, work from searchResults; else from full articles
  const isSearching = Boolean(globalSearch);
  const baseList    = isSearching ? searchResults : articles;

  const categories = useMemo(() => {
    const cats = [...new Set(articles.map(a => a.category))];
    return ['All', ...cats];
  }, [articles]);

  const filtered = useMemo(() => {
    if (isSearching || activeFilter === 'All') return baseList;
    return baseList.filter(a => a.category === activeFilter);
  }, [baseList, activeFilter, isSearching]);

  if ((loading || searchLoading) && articles.length === 0) {
    return (
      <div className="page">
        <div className="loading-wrap">
          <span className="spin" style={{ fontSize: 22 }}>↻</span>
          {loading ? 'Fetching latest tech news...' : 'Searching…'}
        </div>
      </div>
    );
  }

  if (error && articles.length === 0) {
    return (
      <div className="page">
        <div className="error-box">
          ⚠️ Could not connect to backend: <strong>{error}</strong><br />
          <small>Make sure your server is running: <code>cd server && npm run dev</code></small>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Active search banner */}
      {isSearching && (
        <div className="search-active-banner">
          <span>
            {searchLoading
              ? <><span className="spin">↻</span> Searching for "<strong>{globalSearch}</strong>"…</>
              : <>{filtered.length} result{filtered.length !== 1 ? 's' : ''} for "<strong>{globalSearch}</strong>"</>}
          </span>
          <button className="search-clear-btn" onClick={clearSearch}>✕ Clear search</button>
        </div>
      )}

      {/* Category filters (hidden during search) */}
      {!isSearching && (
        <div className="filters">
          {categories.map(cat => (
            <button
              key={cat}
              className={`chip ${activeFilter === cat ? 'active' : ''}`}
              onClick={() => setActiveFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* News Grid */}
      {filtered.length === 0 ? (
        <div className="empty">
          {isSearching
            ? `No articles found for "${globalSearch}". Try different keywords.`
            : 'No articles found. Try a different filter.'}
        </div>
      ) : (
        <div className="news-grid">
          {filtered.map(a => <NewsCard key={a.id} article={a} />)}
        </div>
      )}

      {/* Load More */}
      {nextPage && !isSearching && activeFilter === 'All' && (
        <div className="load-more-wrap">
          <button className="load-more-btn" onClick={loadMore} disabled={loading}>
            {loading ? <><span className="spin">↻</span> Loading...</> : 'Load more articles'}
          </button>
        </div>
      )}
    </div>
  );
}