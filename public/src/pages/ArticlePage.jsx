import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useNews } from '../NewsContext';
import { getCatClass, formatDate } from '../utils';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const STOP = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','are','was','were','has','have','its','this','that','from','by','as','it','be','not','will','also','their','they','said','more','new','says','after','into','about','over','under','when','than','been','being','which','who','had','have','would','could','should','very','just','all','one','two','can','get']);

function buildKeywordFreq(text, keywords = []) {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  keywords.forEach(k => { if (freq[k]) freq[k] += 2; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
}

async function generateSummary(title, description) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Summarize this technology news article in 3 clear, informative sentences. Focus on what happened, why it matters, and the impact.\n\nTitle: ${title}\n\nContent: ${description}`
        }]
      })
    });
    const data = await res.json();
    return data.content?.map(c => c.text || '').join('') || null;
  } catch {
    return null;
  }
}

// ── Prometheus AI Chat component ──────────────────────────────────
function PrometheusChat({ article, history }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [thinking, setThinking] = useState(false);
  const [open, setOpen]         = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const bottomRef = useRef(null);

  // Fetch dynamic prompt suggestions on open
  useEffect(() => {
    if (!open || suggestions.length) return;
    const headlines   = history.slice(0, 15).map(h => h.title);
    const openedTitles = history.slice(0, 5).map(h => h.title);

    fetch('/api/generate-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headlines: [article?.title, ...headlines], openedTitles }),
    })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.prompts)) setSuggestions(d.prompts); })
      .catch(() => {});
  }, [open]); // eslint-disable-line

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const send = async (question) => {
    const q = (question || input).trim();
    if (!q || thinking) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setThinking(true);

    try {
      const res = await fetch('/api/article-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          article: {
            title:       article?.title       || '',
            description: article?.description || '',
            content:     article?.fullContent || '',
          },
          memory: history.slice(0, 10).map(h => ({
            title:       h.title       || '',
            description: h.description || '',
          })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.response || 'No response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Could not reach Prometheus AI. Check that your server is running.' }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button className="prometheus-fab" onClick={() => setOpen(o => !o)} title="Ask Prometheus AI">
        {open ? '✕' : '✦'}
        <span className="prometheus-fab-label">{open ? 'Close' : 'Ask AI'}</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="prometheus-panel">
          <div className="prometheus-header">
            <div>
              <span className="prometheus-title">✦ Prometheus</span>
              <span className="prometheus-sub">AI Research Assistant</span>
            </div>
            <button className="prometheus-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="prometheus-messages">
            {messages.length === 0 && (
              <div className="prometheus-empty">
                <div style={{ fontSize: 28, marginBottom: 8 }}>✦</div>
                <p>Ask me anything about this article or your reading history.</p>
                {suggestions.length > 0 && (
                  <div className="prometheus-suggestions">
                    {suggestions.map((s, i) => (
                      <button key={i} className="prometheus-suggestion" onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`prometheus-msg ${m.role}`}>
                {m.role === 'ai' && <span className="prometheus-msg-label">✦ Prometheus</span>}
                <div className="prometheus-msg-text" dangerouslySetInnerHTML={{
                  __html: m.text
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br/>')
                }} />
              </div>
            ))}

            {thinking && (
              <div className="prometheus-msg ai">
                <span className="prometheus-msg-label">✦ Prometheus</span>
                <div className="prometheus-thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="prometheus-input-row">
            <input
              className="prometheus-input"
              placeholder="Ask about this article…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              disabled={thinking}
            />
            <button
              className="prometheus-send"
              onClick={() => send()}
              disabled={thinking || !input.trim()}
            >
              {thinking ? <span className="spin">↻</span> : '→'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main ArticlePage ──────────────────────────────────────────────
export default function ArticlePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { articles, toggleBookmark, isBookmarked, addToHistory, history } = useNews();

  const [summary, setSummary]               = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [bookmarkAnim, setBookmarkAnim]     = useState(false);

  // Full scraped content
  const [scrapedContent, setScrapedContent] = useState('');
  const [scraping, setScraping]             = useState(false);

  const article    = articles.find(a => a.id === id);
  const bookmarked = article ? isBookmarked(article.id) : false;

  // Track opened article
  useEffect(() => {
    if (!article) return;
    addToHistory(article);

    fetch('/api/store-opened-article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       article.title,
        description: article.description,
        content:     article.fullContent,
        category:    article.category,
        source:      article.source,
      }),
    }).catch(() => {});
  }, [id]); // eslint-disable-line

  // Scrape full article content
  useEffect(() => {
    if (!article?.link || article.link === '#') return;
    setScraping(true);
    setScrapedContent('');

    fetch(`/api/scrape?url=${encodeURIComponent(article.link)}`)
      .then(r => r.json())
      .then(d => { if (d.content) setScrapedContent(d.content); })
      .catch(() => {})
      .finally(() => setScraping(false));
  }, [id]); // eslint-disable-line

  // AI summary — uses scraped content when available
  useEffect(() => {
    if (!article) return;
    setSummary('');
    setSummaryLoading(true);

    // Wait briefly in case scrape finishes quickly; then proceed with what we have
    const timer = setTimeout(() => {
      const text = scrapedContent || article.fullContent || article.description;
      generateSummary(article.title, text).then(result => {
        if (result) {
          setSummary(result);
        } else {
          const sentences = text.split(/(?<=[.!?])\s+/);
          setSummary(sentences.slice(0, 3).join(' '));
        }
        setSummaryLoading(false);
      });
    }, scrapedContent ? 0 : 800);

    return () => clearTimeout(timer);
  }, [article, scrapedContent]); // eslint-disable-line

  const handleBookmark = () => {
    toggleBookmark(article);
    setBookmarkAnim(true);
    setTimeout(() => setBookmarkAnim(false), 600);
  };

  if (!article) {
    return (
      <div className="article-detail-page">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        <div className="error-box">Article not found. Please go back and try again.</div>
      </div>
    );
  }

  const displayContent = scrapedContent || article.fullContent || article.description || '';
  const textForFreq    = displayContent;
  const kwFreq         = buildKeywordFreq(textForFreq, article.keywords);

  const barData = {
    labels: kwFreq.map(([w]) => w),
    datasets: [{
      label: 'Frequency',
      data: kwFreq.map(([, c]) => c),
      backgroundColor: '#e24b4a99',
      borderColor: '#e24b4a',
      borderWidth: 1,
      borderRadius: 4,
    }]
  };

  return (
    <div className="article-detail-page">
      {/* Top bar */}
      <div className="article-topbar">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {scraping && (
            <span style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="spin">↻</span> Loading full article…
            </span>
          )}
          <button
            className={`bookmark-btn ${bookmarked ? 'bookmarked' : ''} ${bookmarkAnim ? 'bookmark-pop' : ''}`}
            onClick={handleBookmark}
            title={bookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
          >
            <span className="bookmark-icon">{bookmarked ? '🔖' : '🏷️'}</span>
            {bookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
        </div>
      </div>

      <div className="article-cat">
        <span className={`cat-badge ${getCatClass(article.category)}`}>{article.category}</span>
        {scrapedContent && (
          <span style={{ fontSize: 11, color: '#1d9e75', marginLeft: 8, fontWeight: 500 }}>
            ✓ Full article loaded
          </span>
        )}
      </div>

      <h1 className="article-title">{article.title}</h1>

      <div className="article-meta">
        <span>📰 {article.source}</span>
        {article.author && <span>✍️ {article.author}</span>}
        <span>🗓 {formatDate(article.pubDate)}</span>
        {article.country && <span>🌐 {article.country}</span>}
      </div>

      {article.image && (
        <img
          className="article-img"
          src={article.image}
          alt={article.title}
          onError={e => (e.target.style.display = 'none')}
        />
      )}

      <div className="article-body">{displayContent}</div>

      {/* Keywords */}
      {article.keywords?.length > 0 && (
        <div className="keywords-row">
          {article.keywords.slice(0, 10).map(k => (
            <span className="kw-chip" key={k}>{k}</span>
          ))}
        </div>
      )}

      {/* AI Summary */}
      <div className="ai-summary-card">
        <div className="ai-summary-label">✦ AI Summary</div>
        {summaryLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#aaa', fontSize: 13 }}>
            <span className="spin">↻</span> Generating summary…
          </div>
        ) : (
          <p className="ai-summary-text">{summary}</p>
        )}
      </div>

      {/* Keyword frequency chart */}
      {kwFreq.length > 0 && (
        <div className="article-chart-card">
          <div className="chart-title">Keyword frequency in article</div>
          <div style={{ height: 200 }}>
            <Bar
              data={barData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { ticks: { font: { size: 11 } } },
                  y: { ticks: { stepSize: 1, font: { size: 11 } } }
                }
              }}
            />
          </div>
        </div>
      )}

      <a
        className="open-full-btn"
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        Read full article ↗
      </a>

      {/* Prometheus AI Chat FAB + Panel */}
      <PrometheusChat article={{ ...article, fullContent: displayContent }} history={history} />
    </div>
  );
}