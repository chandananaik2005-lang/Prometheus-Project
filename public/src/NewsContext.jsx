import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const NewsContext = createContext(null);

// ── Category detection ────────────────────────────────────────────
function detectCategory(article) {
  if (article.category && article.category !== 'technology') return article.category;
  const t = `${article.title || ''} ${article.description || ''}`.toLowerCase();
  if (/\b(ai|artificial intelligence|machine learning|chatgpt|gemini|openai|claude|gpt|llm|neural)\b/.test(t)) return 'AI & ML';
  if (/\b(iphone|apple|macos|ios|ipad|macbook|airpods|wwdc|tim cook)\b/.test(t)) return 'Apple';
  if (/\b(android|samsung|xiaomi|oneplus|realme|oppo|vivo|pixel|smartphone)\b/.test(t)) return 'Mobile';
  if (/\b(hack|cyber|security|breach|malware|phishing|ransomware|vulnerability)\b/.test(t)) return 'Cybersecurity';
  if (/\b(twitter|instagram|facebook|meta|tiktok|youtube|linkedin|social media|threads)\b/.test(t)) return 'Social Media';
  if (/\b(electric|ev|tesla|vehicle|automobile|battery|charging|tata motors)\b/.test(t)) return 'EV & Auto';
  if (/\b(startup|funding|series [abc]|investment|ipo|valuation|unicorn|venture)\b/.test(t)) return 'Startups';
  if (/\b(game|gaming|playstation|xbox|nintendo|steam|esports|gta)\b/.test(t)) return 'Gaming';
  if (/\b(5g|6g|jio|airtel|telecom|network|broadband|spectrum)\b/.test(t)) return 'Telecom';
  if (/\b(bitcoin|crypto|blockchain|ethereum|nft|web3|defi)\b/.test(t)) return 'Crypto';
  return 'General Tech';
}

function buildStats(articles) {
  const catCounts = {};
  articles.forEach(a => {
    const cat = detectCategory(a);
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  const categoryStats = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const dateCounts = {};
  articles.forEach(a => {
    const raw = a.published_at || a.publishedAt || a.createdAt;
    if (!raw) return;
    const d = new Date(raw).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });
  const dateStats = Object.entries(dateCounts)
    .slice(0, 10)
    .map(([date, count]) => ({ date, count }));

  const srcCounts = {};
  articles.forEach(a => {
    const src = typeof a.source === 'object' ? a.source?.name : (a.source || 'Unknown');
    srcCounts[src] = (srcCounts[src] || 0) + 1;
  });
  const sourceStats = Object.entries(srcCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return { categoryStats, dateStats, sourceStats };
}

// ── localStorage helpers ──────────────────────────────────────────
const LS_BOOKMARKS = 'prometheus_bookmarks';
const LS_HISTORY   = 'prometheus_history';
const MAX_HISTORY  = 50;

function loadLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function saveLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export function NewsProvider({ children }) {
  const [articles, setArticles]           = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [dateStats, setDateStats]         = useState([]);
  const [sourceStats, setSourceStats]     = useState([]);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [fetchedAt, setFetchedAt]         = useState(null);

  // ── Bookmarks ─────────────────────────────────────────────────
  const [bookmarks, setBookmarks] = useState(() => loadLS(LS_BOOKMARKS, []));
  useEffect(() => { saveLS(LS_BOOKMARKS, bookmarks); }, [bookmarks]);

  // ── Research history ──────────────────────────────────────────
  const [history, setHistory] = useState(() => loadLS(LS_HISTORY, []));
  useEffect(() => { saveLS(LS_HISTORY, history); }, [history]);

  // ── Global search (persists across page navigations) ─────────
  const [globalSearch, setGlobalSearch]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Fetch all articles ────────────────────────────────────────
  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get('/api/articles');
      if (!Array.isArray(data)) throw new Error('Unexpected response from server');

      const enriched = data.map(a => ({
        ...a,
        id: a._id || a.id || String(Math.random()),
        category: detectCategory(a),
        image: a.image_url || a.urlToImage || a.image || null,
        pubDate: a.published_at || a.publishedAt || a.createdAt || '',
        description: a.description || '',
        fullContent: a.content || a.description || '',
        link: a.article_url || a.url || '#',
        source: typeof a.source === 'object' ? a.source?.name : (a.source || 'Unknown'),
      }));

      const { categoryStats, dateStats, sourceStats } = buildStats(enriched);
      setArticles(enriched);
      setCategoryStats(categoryStats);
      setDateStats(dateStats);
      setSourceStats(sourceStats);
      setTotal(enriched.length);
      setFetchedAt(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => fetchNews(), [fetchNews]);
  const loadMore = useCallback(() => {}, []);

  // ── Global search ─────────────────────────────────────────────
  // First searches in-memory cache; falls back to /api/search for DB results
  const runSearch = useCallback(async (query) => {
    const q = query.trim();
    setGlobalSearch(q);
    if (!q) { setSearchResults([]); return; }

    setSearchLoading(true);
    try {
      // Try backend search endpoint (uses MongoDB full-text index)
      const { data } = await axios.get(`/api/search?q=${encodeURIComponent(q)}`);
      if (Array.isArray(data) && data.length > 0) {
        const enriched = data.map(a => ({
          ...a,
          id: a._id || a.id || String(Math.random()),
          category: detectCategory(a),
          image: a.image_url || a.urlToImage || a.image || null,
          pubDate: a.published_at || a.publishedAt || a.createdAt || '',
          description: a.description || '',
          fullContent: a.content || a.description || '',
          link: a.article_url || a.url || '#',
          source: typeof a.source === 'object' ? a.source?.name : (a.source || 'Unknown'),
        }));
        setSearchResults(enriched);
      } else {
        // Fallback: filter in-memory cache
        const ql = q.toLowerCase();
        const local = articles.filter(a =>
          a.title?.toLowerCase().includes(ql) ||
          a.description?.toLowerCase().includes(ql)
        );
        setSearchResults(local);
      }
    } catch {
      // Offline fallback
      const ql = q.toLowerCase();
      setSearchResults(articles.filter(a =>
        a.title?.toLowerCase().includes(ql) ||
        a.description?.toLowerCase().includes(ql)
      ));
    } finally {
      setSearchLoading(false);
    }
  }, [articles]);

  const clearSearch = useCallback(() => {
    setGlobalSearch('');
    setSearchResults([]);
  }, []);

  // ── Bookmarks ─────────────────────────────────────────────────
  const toggleBookmark = useCallback((article) => {
    setBookmarks(prev => {
      const exists = prev.some(b => b.id === article.id);
      return exists
        ? prev.filter(b => b.id !== article.id)
        : [{ ...article, bookmarkedAt: Date.now() }, ...prev];
    });
  }, []);
  const isBookmarked   = useCallback((id) => bookmarks.some(b => b.id === id), [bookmarks]);
  const clearBookmarks = useCallback(() => setBookmarks([]), []);

  // ── History ───────────────────────────────────────────────────
  const addToHistory = useCallback((article) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.id !== article.id);
      return [{
        id: article.id, title: article.title, source: article.source,
        category: article.category, image: article.image,
        pubDate: article.pubDate, link: article.link,
        description: article.description, openedAt: Date.now(),
      }, ...filtered].slice(0, MAX_HISTORY);
    });
  }, []);
  const clearHistory      = useCallback(() => setHistory([]), []);
  const removeFromHistory = useCallback((id) => setHistory(prev => prev.filter(h => h.id !== id)), []);

  return (
    <NewsContext.Provider value={{
      articles, categoryStats, dateStats, sourceStats,
      total, nextPage: null, loading, error, fetchedAt,
      fetchNews, refresh, loadMore,
      // search
      globalSearch, searchResults, searchLoading, runSearch, clearSearch,
      // bookmarks
      bookmarks, toggleBookmark, isBookmarked, clearBookmarks,
      // history
      history, addToHistory, clearHistory, removeFromHistory,
    }}>
      {children}
    </NewsContext.Provider>
  );
}

export function useNews() {
  return useContext(NewsContext);
}