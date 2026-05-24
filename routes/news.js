const express = require('express');
const router = express.Router();
const axios = require('axios');

const API_KEY = process.env.NEWS_API_KEY ;
const BASE = 'https://newsdata.io/api/1';

// In-memory cache - cleared on forced refresh
let cache = { articles: [], categoryStats: [], dateStats: [], sourceStats: [], fetchedAt: null };

function detectCategory(text) {
  const t = (text || '').toLowerCase();
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

function buildStats(articles, key) {
  const counts = {};
  articles.forEach(a => { counts[a[key]] = (counts[a[key]] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function buildDateStats(articles) {
  const counts = {};
  articles.forEach(a => {
    if (!a.pubDate) return;
    const d = new Date(a.pubDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    counts[d] = (counts[d] || 0) + 1;
  });
  return Object.entries(counts).slice(0, 10).map(([date, count]) => ({ date, count }));
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

async function fetchFromAPI(page = null) {
  const params = new URLSearchParams({
    apikey: API_KEY,
    category: 'technology',
    language: 'en',
    ...(page && { page })
  });
  const { data } = await axios.get(`${BASE}/latest?${params}`, { timeout: 10000 });
  return data;
}

function processArticles(results) {
  return (results || []).map((item, i) => {
    const combined = `${item.title || ''} ${item.description || ''} ${item.content || ''}`;
    return {
      id: item.article_id || String(i),
      title: item.title || 'Untitled',
      description: stripHtml(item.description || item.content || '').slice(0, 400),
      fullContent: stripHtml(item.content || item.description || ''),
      link: item.link || '#',
      pubDate: item.pubDate || '',
      source: item.source_name || item.source_id || 'Unknown',
      image: item.image_url || null,
      author: item.creator ? item.creator[0] : null,
      keywords: item.keywords || [],
      country: (item.country || []).join(', '),
      category: detectCategory(combined),
    };
  });
}

// GET /api/news?refresh=true&page=xxx
router.get('/news', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const page = req.query.page || null;

    // Use cache if fresh (5 min) and no force refresh and no pagination
    const cacheAge = cache.fetchedAt ? (Date.now() - cache.fetchedAt) / 1000 : Infinity;
    if (!forceRefresh && !page && cache.articles.length > 0 && cacheAge < 300) {
      return res.json({
        success: true,
        fromCache: true,
        fetchedAt: cache.fetchedAt,
        total: cache.articles.length,
        articles: cache.articles,
        categoryStats: cache.categoryStats,
        dateStats: cache.dateStats,
        sourceStats: cache.sourceStats,
        nextPage: cache.nextPage || null
      });
    }

    const data = await fetchFromAPI(page);

    if (data.status !== 'success') {
      return res.status(400).json({ success: false, error: data.message || 'API error' });
    }

    const articles = processArticles(data.results);

    // On refresh or first load, replace cache. On pagination, append.
    if (!page) {
      cache = {
        articles,
        categoryStats: buildStats(articles, 'category'),
        dateStats: buildDateStats(articles),
        sourceStats: buildStats(articles, 'source').slice(0, 8),
        fetchedAt: Date.now(),
        nextPage: data.nextPage || null
      };
    } else {
      // pagination - merge
      const merged = [...cache.articles, ...articles];
      cache = {
        articles: merged,
        categoryStats: buildStats(merged, 'category'),
        dateStats: buildDateStats(merged),
        sourceStats: buildStats(merged, 'source').slice(0, 8),
        fetchedAt: cache.fetchedAt,
        nextPage: data.nextPage || null
      };
    }

    res.json({
      success: true,
      fromCache: false,
      fetchedAt: cache.fetchedAt,
      total: articles.length,
      articles,
      categoryStats: cache.categoryStats,
      dateStats: cache.dateStats,
      sourceStats: cache.sourceStats,
      nextPage: data.nextPage || null
    });
  } catch (err) {
    console.error('News fetch error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stats — analytics only
router.get('/stats', async (req, res) => {
  try {
    if (cache.articles.length > 0) {
      return res.json({
        success: true,
        total: cache.articles.length,
        categoryStats: cache.categoryStats,
        dateStats: cache.dateStats,
        sourceStats: cache.sourceStats,
        fetchedAt: cache.fetchedAt
      });
    }
    const data = await fetchFromAPI();
    if (data.status !== 'success') return res.status(400).json({ success: false, error: data.message });
    const articles = processArticles(data.results);
    res.json({
      success: true,
      total: articles.length,
      categoryStats: buildStats(articles, 'category'),
      dateStats: buildDateStats(articles),
      sourceStats: buildStats(articles, 'source').slice(0, 8)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/news/:id — single article
router.get('/news/:id', async (req, res) => {
  const article = cache.articles.find(a => a.id === req.params.id);
  if (article) return res.json({ success: true, article });
  res.status(404).json({ success: false, error: 'Article not found' });
});

module.exports = router;
