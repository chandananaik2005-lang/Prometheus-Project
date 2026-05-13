// Client-side JavaScript for Prometheus Tech Radar

// Global state
let currentArticle = null;
let articles = [];
let isLoading = false;

// Screen management
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(`screen-${screenId}`).classList.add('active');
  
  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  const activeNav = document.querySelector(`.nav-item[onclick*="${screenId}"]`);
  if (activeNav) activeNav.classList.add('active');
}

// Authentication
function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  if (email && password) {
    sessionStorage.setItem('loggedIn', 'true');
    sessionStorage.setItem('userEmail', email);
    loadUserProfile();
    showScreen('dashboard');
    loadArticles();
    setupSearch();
  }
}

function signup() {
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;
  
  if (password !== confirm) {
    alert('Passwords do not match');
    return;
  }
  
  if (name && email && password) {
    sessionStorage.setItem('loggedIn', 'true');
    sessionStorage.setItem('userName', name);
    sessionStorage.setItem('userEmail', email);
    loadUserProfile();
    showScreen('dashboard');
    loadArticles();
    setupSearch();
  }
}

function logout() {
  sessionStorage.clear();
  showScreen('login');
}

function loadUserProfile() {
  const name = sessionStorage.getItem('userName') || sessionStorage.getItem('userEmail') || 'User';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  
  document.querySelectorAll('.avatar').forEach(avatar => {
    avatar.textContent = initials;
  });
}

// Article loading and rendering
async function loadArticles() {
  if (isLoading) return;
  isLoading = true;
  
  const container = document.getElementById('news-container');
  container.innerHTML = '<div class="loader">Loading intelligence...</div>';
  
  try {
    const response = await fetch('/api/articles');
    articles = await response.json();
    renderArticles(articles.slice(0, 6));
  } catch (error) {
    console.error('Failed to load articles:', error);
    container.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">Failed to load articles</div>';
  } finally {
    isLoading = false;
  }
}

function renderArticles(articlesToRender) {
  const container = document.getElementById('news-container');
  
  if (articlesToRender.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">No articles found</div>';
    return;
  }
  
  container.innerHTML = articlesToRender.map(article => `
    <div class="feed-card-exact" onclick="openArticle('${article.id || article._id}')">
      <div class="feed-left-box">
        <img src="${article.image_url || article.image || 'https://picsum.photos/seed/tech/800/500'}" 
             alt="${article.title}" class="feed-thumb-exact" 
             onerror="this.src='https://picsum.photos/seed/fallback/800/500'">
      </div>
      <div class="feed-right">
        <div class="feed-meta">
          <span class="feed-brand">${article.source || 'Tech Radar'}</span>
          <span class="feed-sep">•</span>
          <span class="feed-age">${formatTimeAgo(article.published_at || article.createdAt)}</span>
        </div>
        <h3 class="feed-headline">${article.title}</h3>
        <p class="feed-desc">${article.description}</p>
        <div class="feed-pill-row">
          <span>${article.category || 'Technology'}</span>
          <span>${Math.floor(Math.random() * 10) + 1} min read</span>
        </div>
      </div>
    </div>
  `).join('');
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function loadMoreArticles() {
  const currentCount = document.querySelectorAll('.feed-card-exact').length;
  const moreArticles = articles.slice(currentCount, currentCount + 3);
  renderMoreArticles(moreArticles);
}

function renderMoreArticles(articlesToRender) {
  const container = document.getElementById('news-container');
  const newHtml = articlesToRender.map(article => `
    <div class="feed-card-exact" onclick="openArticle('${article.id || article._id}')">
      <div class="feed-left-box">
        <img src="${article.image_url || article.image || 'https://picsum.photos/seed/tech/800/500'}" 
             alt="${article.title}" class="feed-thumb-exact" 
             onerror="this.src='https://picsum.photos/seed/fallback/800/500'">
      </div>
      <div class="feed-right">
        <div class="feed-meta">
          <span class="feed-brand">${article.source || 'Tech Radar'}</span>
          <span class="feed-sep">•</span>
          <span class="feed-age">${formatTimeAgo(article.published_at || article.createdAt)}</span>
        </div>
        <h3 class="feed-headline">${article.title}</h3>
        <p class="feed-desc">${article.description}</p>
        <div class="feed-pill-row">
          <span>${article.category || 'Technology'}</span>
          <span>${Math.floor(Math.random() * 10) + 1} min read</span>
        </div>
      </div>
    </div>
  `).join('');
  
  container.insertAdjacentHTML('beforeend', newHtml);
  
  // Hide load more button if no more articles
  if (currentCount + articlesToRender.length >= articles.length) {
    document.getElementById('load-more').classList.add('hidden');
  }
}

// Article view
async function openArticle(articleId) {
  currentArticle = articles.find(a => (a.id || a._id) === articleId);
  if (!currentArticle) {
    // Try to fetch from server
    try {
      const response = await fetch(`/api/articles`);
      const allArticles = await response.json();
      currentArticle = allArticles.find(a => (a.id || a._id) === articleId);
    } catch (error) {
      console.error('Failed to fetch article:', error);
      return;
    }
  }
  
  if (!currentArticle) return;
  
  showScreen('article');
  renderArticle(currentArticle);
  generateAISummary(currentArticle);
  loadRelatedArticles(currentArticle);
}

function renderArticle(article) {
  document.getElementById('articleCategory').textContent = article.category || 'Technology';
  document.getElementById('articleTitle').textContent = article.title;
  document.getElementById('articleAuthor').textContent = article.source || 'Tech Radar';
  document.getElementById('articleDate').textContent = new Date(article.published_at || article.createdAt).toLocaleDateString();
  document.getElementById('articleContent').innerHTML = article.content || generateArticleContent(article);
  
  const heroElement = document.getElementById('articleImage');
  if (article.image_url || article.image) {
    heroElement.innerHTML = `<img src="${article.image_url || article.image}" style="width:100%;height:100%;object-fit:cover;">`;
  }
}

function generateArticleContent(article) {
  return `
    <p>${article.description}</p>
    <p>This comprehensive analysis explores the implications and impact of recent developments in the technology sector. 
    Industry experts suggest this transformation represents a significant shift in how we approach digital innovation 
    and technological advancement.</p>
    <p>As we continue to monitor these developments, it's clear that the technology landscape is evolving at an 
    unprecedented pace. Organizations and individuals alike must adapt to these changes to remain competitive 
    in today's digital ecosystem.</p>
    <h2>Key Takeaways</h2>
    <ul>
      <li>Rapid technological advancement continues to reshape industries</li>
      <li>Innovation cycles are becoming shorter and more frequent</li>
      <li>Digital transformation remains a priority for organizations</li>
      <li>User expectations for smart technology are increasing</li>
    </ul>
    <p>Looking ahead, we can expect continued momentum in these areas as companies invest heavily in research 
    and development to maintain their competitive edge in the global technology market.</p>
  `;
}

// AI Summary functionality
async function generateAISummary(article) {
  const summaryElement = document.getElementById('aiSummary');
  summaryElement.textContent = 'Generating AI summary...';
  
  try {
    const response = await fetch('/api/article-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        article: article,
        question: 'Provide a concise 3-sentence summary of this article highlighting the key points and implications.'
      })
    });
    
    const data = await response.json();
    summaryElement.textContent = data.response || 'Summary unavailable';
  } catch (error) {
    console.error('Failed to generate AI summary:', error);
    summaryElement.textContent = 'AI summary temporarily unavailable. Please try again later.';
  }
}

// Related articles
async function loadRelatedArticles(article) {
  const relatedElement = document.getElementById('relatedIntel');
  relatedElement.innerHTML = '<div class="intel-card"><div class="intel-dot"></div><div><div class="intel-headline">Loading related articles...</div><div class="intel-meta">Analyzing content...</div></div></div>';
  
  try {
    // Get articles from same category
    const response = await fetch('/api/articles');
    const allArticles = await response.json();
    const related = allArticles
      .filter(a => a.category === article.category && (a.id || a._id) !== (article.id || article._id))
      .slice(0, 3);
    
    if (related.length === 0) {
      relatedElement.innerHTML = '<div class="intel-card"><div class="intel-dot"></div><div><div class="intel-headline">No related articles found</div><div class="intel-meta">Try exploring other categories</div></div></div>';
      return;
    }
    
    relatedElement.innerHTML = related.map(a => `
      <div class="intel-card" onclick="openArticle('${a.id || a._id}')" style="cursor:pointer;">
        <div class="intel-dot"></div>
        <div>
          <div class="intel-headline">${a.title}</div>
          <div class="intel-meta">${a.source || 'Tech Radar'} • ${formatTimeAgo(a.published_at || a.createdAt)}</div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load related articles:', error);
    relatedElement.innerHTML = '<div class="intel-card"><div class="intel-dot"></div><div><div class="intel-headline">Failed to load related articles</div><div class="intel-meta">Please refresh the page</div></div></div>';
  }
}

// Chat functionality
async function askArticleBot() {
  const input = document.getElementById('chatInput');
  const question = input.value.trim();
  
  if (!question || !currentArticle) return;
  
  const messagesContainer = document.getElementById('chatMessages');
  
  // Add user message
  messagesContainer.innerHTML += `<div class="chat-user">${question}</div>`;
  input.value = '';
  
  // Add loading message
  const loadingId = 'loading-' + Date.now();
  messagesContainer.innerHTML += `<div id="${loadingId}" class="chat-bot">Thinking...</div>`;
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  try {
    const response = await fetch('/api/article-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article: currentArticle, question })
    });
    
    const data = await response.json();
    const loadingElement = document.getElementById(loadingId);
    if (loadingElement) {
      loadingElement.textContent = data.response || data.reply || 'I apologize, but I couldn\'t process your request.';
    }
  } catch (error) {
    console.error('Chat error:', error);
    const loadingElement = document.getElementById(loadingId);
    if (loadingElement) {
      loadingElement.textContent = 'Sorry, I encountered an error. Please try again.';
    }
  }
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function quickAsk(question) {
  document.getElementById('chatInput').value = question;
  askArticleBot();
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById('searchBox');
  if (!searchInput) return;
  
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(e.target.value);
    }, 300);
  });
}

async function performSearch(query) {
  if (!query.trim()) {
    renderArticles(articles.slice(0, 6));
    return;
  }
  
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const searchResults = await response.json();
    renderArticles(searchResults.slice(0, 6));
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// Utility functions
function bookmarkCurrentArticle() {
  if (!currentArticle) return;
  
  // Simple bookmarking using localStorage
  let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
  if (!bookmarks.find(b => (b.id || b._id) === (currentArticle.id || currentArticle._id))) {
    bookmarks.push(currentArticle);
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    alert('Article bookmarked!');
  } else {
    alert('Already bookmarked');
  }
}

function shareCurrentArticle() {
  if (!currentArticle) return;
  
  if (navigator.share) {
    navigator.share({
      title: currentArticle.title,
      text: currentArticle.description,
      url: window.location.href
    });
  } else {
    // Fallback: copy to clipboard
    const text = `${currentArticle.title}\n\n${currentArticle.description}`;
    navigator.clipboard.writeText(text).then(() => {
      alert('Article details copied to clipboard!');
    });
  }
}

function openVoice() {
  // Voice functionality placeholder
  alert('Voice features coming soon!');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Check authentication
  if (sessionStorage.getItem('loggedIn') === 'true') {
    loadUserProfile();
    showScreen('dashboard');
    loadArticles();
    setupSearch();
  } else {
    showScreen('login');
  }
  
  // Auto-refresh every 5 minutes
  setInterval(() => {
    if (sessionStorage.getItem('loggedIn') === 'true') {
      loadArticles();
    }
  }, 300000);
});
