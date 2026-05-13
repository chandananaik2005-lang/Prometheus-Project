"use strict";

/* ================================================================
   PROMETHEUS TECH RADAR — app.js
   Render-ready: all fetch() calls use relative paths (/api/...)
   This file replaces the old app.js AND the <script> block that
   was embedded inside index.html.
================================================================ */

/* ── Global state ─────────────────────────────────────────── */
let allArticles    = [];
let visibleCount   = 10;
let currentArticle = null;
let originalArticles = [];
let filteredArticles = [];
/* ================================================================
   SCREEN NAVIGATION
================================================================ */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById("screen-" + id);
  if (el) { el.classList.add("active"); window.scrollTo(0, 0); }

  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.remove("active");
    if ((item.getAttribute("onclick") || "").includes("'" + id + "'"))
      item.classList.add("active");
  });

  if (id === "settings") { loadUserProfile(); loadResearchHistory(); }
}

/* ================================================================
   TOAST  (replaces all alert() calls)
================================================================ */
function showToast(msg, type = "info") {
  let t = document.getElementById("_toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "_toast";
    Object.assign(t.style, {
      position: "fixed", bottom: "32px", left: "50%",
      transform: "translateX(-50%) translateY(100px)",
      background: "#1a1a1a", color: "#f0f0f0",
      padding: "12px 26px", borderRadius: "10px",
      fontSize: "14px", fontFamily: "inherit",
      zIndex: "99999", transition: "transform .3s ease",
      border: "1px solid #333", boxShadow: "0 8px 32px rgba(0,0,0,.5)",
      whiteSpace: "nowrap", pointerEvents: "none",
    });
    document.body.appendChild(t);
  }
  const colours = { success: "#22c55e", error: "#ef4444", info: "#3b6ef5", warn: "#f59e0b" };
  t.style.borderColor = colours[type] || "#333";
  t.textContent = msg;
  t.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(t._tmr);
  t._tmr = setTimeout(() => { t.style.transform = "translateX(-50%) translateY(100px)"; }, 3200);
}

/* ================================================================
   AUTH
================================================================ */
function login() {
  const email    = (document.getElementById("login-email")?.value || "").trim();
  const password =  document.getElementById("login-password")?.value || "";

  if (!email || !password) { showToast("Please fill in all fields.", "error"); return; }

  const stored = JSON.parse(localStorage.getItem("prom_user") || "null");
  if (!stored)                                   { showToast("No account found — sign up first.", "error"); return; }
  if (email !== stored.email || password !== stored.password)
                                                 { showToast("Wrong email or password.", "error");          return; }

  sessionStorage.setItem("loggedIn", "true");
  loadUserProfile();
  showScreen("dashboard");
  loadArticles();
  setupSearch();
}

function signup() {
  const name     = (document.getElementById("signup-name")?.value     || "").trim();
  const email    = (document.getElementById("signup-email")?.value    || "").trim();
  const password =  document.getElementById("signup-password")?.value || "";
  const confirm  =  document.getElementById("signup-confirm")?.value  || "";

  if (!name || !email || !password || !confirm) { showToast("Please fill all fields.", "error"); return; }
  if (password !== confirm)  { showToast("Passwords do not match.",          "error"); return; }
  if (password.length < 8)   { showToast("Password needs 8+ characters.",    "error"); return; }

  localStorage.setItem("prom_user", JSON.stringify({ name, email, password }));
  showToast("Account created! Please log in.", "success");
  showScreen("login");
}

function logout() {
  sessionStorage.removeItem("loggedIn");
  showScreen("login");
}

/* ================================================================
   VOICE MODAL
================================================================ */
function openVoice()  { document.getElementById("voiceOverlay")?.classList.add("open"); }
function closeVoice() { document.getElementById("voiceOverlay")?.classList.remove("open"); }
function closeVoiceOutside(e) {
  if (e.target === document.getElementById("voiceOverlay")) closeVoice();
}

/* ================================================================
   USER PROFILE
================================================================ */
function loadUserProfile() {
  const user = JSON.parse(localStorage.getItem("prom_user") || "null");
  if (!user) return;

  const initials = user.name.substring(0, 2).toUpperCase();

  // Topbar / article screen avatars
  ["topbarAvatar", "articleAvatar2"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });

  // Settings page
  const avatarEl = document.getElementById("profileAvatar");
  if (avatarEl) {
    // Update only the text node so the child .profile-online div is preserved
    const tn = [...avatarEl.childNodes].find(n => n.nodeType === 3);
    if (tn) tn.nodeValue = user.name.charAt(0).toUpperCase();
  }
  const nameEl  = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  if (nameEl)  nameEl.textContent  = user.name;
  if (emailEl) emailEl.textContent = user.email;
}

/* ================================================================
   BOOKMARKS
================================================================ */
function bookmarkCurrentArticle() {
  if (!currentArticle) return;
  const bk  = JSON.parse(localStorage.getItem("prom_bookmarks") || "[]");
  const key  = currentArticle.title;
  if (bk.find(b => b.title === key)) { showToast("Already bookmarked.", "info"); return; }
  bk.push({ title: key, category: currentArticle.category || "Technology",
            source: currentArticle.source || "Prometheus", savedAt: Date.now() });
  localStorage.setItem("prom_bookmarks", JSON.stringify(bk));
  showToast("Bookmarked! ✅", "success");
}

function shareCurrentArticle() {
  if (!currentArticle) return;
  if (navigator.share) {
    navigator.share({ title: currentArticle.title, text: currentArticle.description || "" });
  } else {
    navigator.clipboard?.writeText(window.location.href);
    showToast("Link copied!", "success");
  }
}

function loadResearchHistory() {
  const container = document.getElementById("researchHistory");
  if (!container) return;
  const bk = JSON.parse(localStorage.getItem("prom_bookmarks") || "[]");
  if (!bk.length) {
    container.innerHTML = `<p style="color:var(--text3);font-size:13px;">No history yet. Bookmark articles to see them here.</p>`;
    return;
  }
  container.innerHTML = "";
  bk.slice(-6).reverse().forEach(item => {
    const d = document.createElement("div");
    d.className = "rh-thumb";
    d.style.background = "linear-gradient(135deg,#1e3a8a,#7c3aed)";
    d.innerHTML = `<span class="rh-label">${item.category || "Tech"}</span>
                   <span class="rh-title">${item.title}</span>`;
    container.appendChild(d);
  });
}

/* ================================================================
   SETTINGS CONTROLS
================================================================ */
function initTheme() {
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;
  if (localStorage.getItem("prom_theme") === "light") {
    document.body.classList.add("light-mode");
    toggle.checked = true;
  }
  toggle.addEventListener("change", () => {
    document.body.classList.toggle("light-mode", toggle.checked);
    localStorage.setItem("prom_theme", toggle.checked ? "light" : "dark");
  });
}

function initPasswordUpdate() {
  const btn = document.getElementById("updatePasswordBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const cur  = document.getElementById("currentPass")?.value  || "";
    const newP = document.getElementById("newPass")?.value      || "";
    const conf = document.getElementById("confirmPass")?.value  || "";
    const user = JSON.parse(localStorage.getItem("prom_user")   || "null");
    if (!user)            { showToast("No user found.", "error");              return; }
    if (cur !== user.password) { showToast("Current password wrong ❌", "error");  return; }
    if (newP !== conf)    { showToast("New passwords don't match ❌", "error"); return; }
    if (newP.length < 6)  { showToast("Min 6 characters ⚠️", "warn");          return; }
    user.password = newP;
    localStorage.setItem("prom_user", JSON.stringify(user));
    showToast("Password updated ✅", "success");
    ["currentPass","newPass","confirmPass"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  });
}

function initDeleteAccount() {
  const btn = document.getElementById("deleteAccountBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!confirm("Delete your account permanently? This cannot be undone.")) return;
    localStorage.clear();
    sessionStorage.clear();
    showToast("Account deleted.", "info");
    setTimeout(() => location.reload(), 900);
  });
}

/* ================================================================
   IMAGE HELPER  (picsum with deterministic seed — no broken URLs)
================================================================ */
function getTopicImage(article) {
  const text = ((article.title || "") + " " + (article.description || "")).toLowerCase();
  let seed = "technology";
  if      (text.includes("openai") || text.includes(" ai ")) seed = "ai";
  else if (text.includes("apple")  || text.includes("iphone")) seed = "apple";
  else if (text.includes("tesla")  || text.includes(" ev "))   seed = "electric";
  else if (text.includes("space")  || text.includes("nasa"))   seed = "space";
  else if (text.includes("robot"))   seed = "robot";
  else if (text.includes("nvidia") || text.includes("chip"))   seed = "chip";
  else if (text.includes("cyber"))   seed = "cyber";
  else if (text.includes("quantum")) seed = "quantum";
  else if (text.includes("startup")) seed = "startup";
  const hash = (article.title || seed).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return `https://picsum.photos/seed/${seed}${hash % 9999}/800/500`;
}

/* ================================================================
   HELPERS
================================================================ */
function isEnglish(text) {
  if (!text || text.length < 5) return false;
  return (text.match(/[a-zA-Z]/g) || []).length / text.length > 0.45;
}

function isTechArticle(a) {
  const t = ((a.title||"")+" "+(a.description||"")).toLowerCase();
  return ["ai","technology","robot","startup","software","hardware","chip","nvidia",
    "intel","microsoft","google","apple","tesla","cybersecurity","cloud","openai",
    "meta","programming","quantum","space","machine learning","semiconductor",
    "electric","automation","data"].some(k => t.includes(k));
}

function timeAgo(dateStr) {
  if (!dateStr) return "recently";
  const d = new Date(dateStr);
  if (isNaN(d)) return "recently";
  const m = Math.floor((Date.now() - d) / 60000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m/60)}h ago`;
  if (m < 10080)return `${Math.floor(m/1440)}d ago`;
  return d.toLocaleDateString();
}

function safeImg(article) {
  const u = article.image_url || article.image || "";
  return u.startsWith("http") ? u : getTopicImage(article);
}

/* ================================================================
   LOAD ARTICLES  — relative /api/articles (works on Render)
================================================================ */
async function loadArticles() {
  const container = document.getElementById("news-container");
  if (!container) return;

  // Skeleton loader
  container.innerHTML = [1,2,3,4].map(() => `
    <div style="display:flex;gap:14px;padding:16px;background:var(--surface);border-radius:12px;margin-bottom:12px;">
      <div style="width:120px;height:80px;background:var(--surface2);border-radius:8px;flex-shrink:0;animation:pulse 1.4s ease-in-out infinite;"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center;">
        <div style="height:11px;background:var(--surface2);border-radius:4px;width:55%;animation:pulse 1.4s ease-in-out infinite;"></div>
        <div style="height:15px;background:var(--surface2);border-radius:4px;width:90%;animation:pulse 1.4s ease-in-out infinite;"></div>
        <div style="height:11px;background:var(--surface2);border-radius:4px;width:70%;animation:pulse 1.4s ease-in-out infinite;"></div>
      </div>
    </div>`).join("");

  try {
    // ↓ relative path — works on localhost AND Render
    const res = await fetch(`/api/articles?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let data = await res.json();
    let arts = Array.isArray(data) ? data : (data.articles || []);

    // Filter & deduplicate
    arts = arts.filter(a => a.title && a.description && isEnglish(a.title) && isTechArticle(a));
    const seen = new Set();
    arts = arts.filter(a => {
      const k = a.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

  originalArticles = arts;
filteredArticles = arts;
allArticles = arts;
    visibleCount = 10;
    renderArticles();
  } catch (err) {
    console.error("loadArticles:", err);
    container.innerHTML = `
      <div style="padding:32px;text-align:center;background:var(--surface);border-radius:12px;">
        <div style="font-size:32px;">⚠️</div>
        <div style="font-weight:600;margin:10px 0 6px;color:var(--text1);">Could not load feed</div>
        <div style="font-size:13px;color:#888;">${err.message}</div>
        <button onclick="loadArticles()"
          style="margin-top:16px;padding:8px 22px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">
          Retry
        </button>
      </div>`;
  }
}

/* ================================================================
   RENDER ARTICLES
================================================================ */
function renderArticles() {
  const container = document.getElementById("news-container");
  if (!container) return;
  container.innerHTML = "";

  if (!allArticles.length) {
    container.innerHTML = `
      <div style="padding:40px;text-align:center;color:#888;">
        <div style="font-size:32px;margin-bottom:10px;">📭</div>
        No articles yet — check back shortly.
      </div>`;
    return;
  }

  const list = filteredArticles.length ? filteredArticles : allArticles;

list.slice(0, visibleCount).forEach(article => {
    const card = document.createElement("div");
    card.className = "feed-item";
    const img  = safeImg(article);
    const mins = Math.ceil(((article.content || article.description || "").split(" ").length) / 200) || 4;

    card.innerHTML = `
      <div class="feed-card-exact">
        <div class="feed-left-box">
          <img class="feed-thumb-exact" src="${img}" loading="lazy"
               onerror="this.onerror=null;this.src='https://picsum.photos/seed/tech/800/500';">
        </div>
        <div class="feed-right">
          <div class="feed-meta">
            <span class="feed-brand">${article.source || "Prometheus"}</span>
            <span class="feed-sep">•</span>
            <span class="feed-age">${timeAgo(article.published_at)}</span>
          </div>
          <div class="feed-headline">${article.title}</div>
          <div class="feed-desc">${(article.description || "").slice(0, 160)}${article.description?.length > 160 ? "…" : ""}</div>
          <div class="feed-pill-row">
            <span>${article.category || "Technology"}</span>
            <span>${mins} min read</span>
          </div>
        </div>
      </div>`;

    // Pass full object — no ID look-up needed
    card.addEventListener("click", () => openArticle(article));
    container.appendChild(card);
  });

  const btn = document.getElementById("load-more");
if (btn) {
  btn.style.display =
    visibleCount >= (filteredArticles.length || allArticles.length)
      ? "none"
      : "block";
}
}

/* ================================================================
   LOAD MORE
================================================================ */
function loadMoreArticles() {
  visibleCount += 10;
  renderArticles();
}

/* ================================================================
   OPEN ARTICLE
================================================================ */
function openArticle(article) {
  currentArticle = article;
  showScreen("article");

  const img = safeImg(article);
  document.getElementById("articleTitle").textContent    = article.title    || "Untitled";
  document.getElementById("articleCategory").textContent = article.category || "Technology";
  document.getElementById("articleAuthor").textContent   = article.source   || "Prometheus AI";
  document.getElementById("articleDate").textContent     = timeAgo(article.published_at);
  document.getElementById("articleAvatarIcon").textContent = (article.source || "AI").substring(0, 2).toUpperCase();

  document.getElementById("articleImage").innerHTML =
    `<img src="${img}" style="width:100%;height:420px;object-fit:cover;border-radius:20px;"
          onerror="this.onerror=null;this.src='https://picsum.photos/seed/tech/1200/500';">`;

const raw = article.content || article.description || "No content available.";

// Clean HTML
let text = raw.replace(/<[^>]*>/g, "");

// Split into sentences
let sentences = text
  .split(/(?<=[.!?])\s+/)
  .filter(s => s.trim().length > 0);

// Remove duplicates but preserve order
sentences = [...new Set(sentences)];

// Group sentences into Wikipedia-style paragraphs
const chunkSize = 5; // 4–6 sentences per section

let sections = [];
for (let i = 0; i < sentences.length; i += chunkSize) {
  sections.push(sentences.slice(i, i + chunkSize));
}

// Generate Wikipedia-style HTML
let formatted = sections.map((group, index) => {
 const keywords = ["Overview", "Background", "Key Developments", "Impact", "Analysis", "Conclusion"];
const heading = keywords[index] || `Section ${index + 1}`;

  return `
    <div style="margin-bottom:30px;">
      
      <h2 style="
        font-size:20px;
        margin:25px 0 10px;
        color:#ffffff;
        border-left:4px solid #3b6ef5;
        padding-left:10px;
      ">
        ${heading}
      </h2>

      ${group.map(p => `
        <p style="
          font-size:16px;
          line-height:1.9;
          color:#d6d6d6;
          text-align:justify;
          margin-bottom:14px;
        ">
          ${p}
        </p>
      `).join("")}

    </div>
  `;
}).join("");
// Auto headings every few paragraphs


document.getElementById("articleContent").innerHTML = `
  <div style="
    padding:40px;
    background:#111;
    border-radius:18px;
    overflow:hidden;
  ">
    ${formatted}
  </div>
`;

  // Clear previous chat
  const chatBox = document.getElementById("chatMessages");
  if (chatBox) chatBox.innerHTML = "";

  // Auto-generate AI summary
  generateAISummary(article);

  // Related intel
  renderIntelHub(article);
}

/* ================================================================
   AI SUMMARY  — relative /api/article-chat
================================================================ */
async function generateAISummary(article) {
  const el = document.getElementById("aiSummary");
  if (!el) return;
  el.textContent = "Generating AI summary…";

  try {
    const res = await fetch("/api/article-chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        question: "Give a concise 3-sentence summary highlighting the key points and implications.",
        article:  { title: article.title, description: article.description,
                    content: (article.content || "").slice(0, 4000) },
      }),
    });
    const data = await res.json();
    el.textContent = data.response || "Summary unavailable.";
  } catch {
    el.textContent = "AI summary temporarily unavailable.";
  }
}

/* ================================================================
   INTEL HUB (related articles)
================================================================ */
function renderIntelHub(article) {
  const relatedEl = document.getElementById("relatedIntel");
  if (!relatedEl) return;

  const related = allArticles.filter(a => a.title !== article.title).slice(0, 5);

  if (!related.length) {
    relatedEl.innerHTML = `<div class="intel-card"><div class="intel-dot"></div>
      <div><div class="intel-headline">No related articles found</div>
      <div class="intel-meta">Explore the dashboard</div></div></div>`;
    return;
  }

  relatedEl.innerHTML = related.map((item, i) => `
    <div class="intel-card" data-title="${item.title}" style="cursor:pointer;">
      <div class="intel-dot"></div>
      <div>
        <div class="intel-headline">${item.title}</div>
        <div class="intel-meta">${item.source || "Prometheus"} • ${timeAgo(item.published_at)}</div>
      </div>
    </div>`).join("");

  relatedEl.querySelectorAll(".intel-card").forEach(card => {
  card.addEventListener("click", () => {
    const title = card.dataset.title;
    const found = allArticles.find(a => a.title === title);
    if (found) openArticle(found);
  });
});
}

/* ================================================================
   CHATBOT  — relative /api/article-chat
================================================================ */
function quickAsk(question) {
  const input = document.getElementById("chatInput");
  if (input) { input.value = question; askArticleBot(); }
}

async function askArticleBot() {
  const input = document.getElementById("chatInput");
  const box   = document.getElementById("chatMessages");
  if (!input || !box || !currentArticle) return;

  const question = input.value.trim();
  if (!question) return;

  box.innerHTML += `<div class="chat-user">${question}</div>`;
  input.value    = "";

  const thinkId = "th-" + Date.now();
  box.innerHTML += `<div id="${thinkId}" class="chat-bot" style="opacity:.6;">Thinking…</div>`;
  box.scrollTop  = box.scrollHeight;

  try {
    // ↓ relative path — works on localhost AND Render
    const res  = await fetch("/api/article-chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        question,
        article: {
          title:       currentArticle.title       || "",
          description: currentArticle.description || "",
          content:     (currentArticle.content    || "").slice(0, 4000),
          source:      currentArticle.source      || "",
        },
      }),
    });
    const data  = await res.json();
    const think = document.getElementById(thinkId);
    if (think) think.innerHTML = data.response || "No response.";
  } catch {
    const think = document.getElementById(thinkId);
    if (think) think.textContent = "⚠️ AI unavailable — check your OpenAI key.";
  }
  box.scrollTop = box.scrollHeight;
}

/* ================================================================
   SEARCH  — relative /api/search
================================================================ */
function setupSearch() {
  const box = document.getElementById("searchBox");
  if (!box) return;

  let timer;

  box.addEventListener("input", (e) => {
    clearTimeout(timer);

    const q = e.target.value.trim();

    timer = setTimeout(async () => {
      try {
        // If search is cleared → restore original feed
        if (q.length < 2) {
          filteredArticles = originalArticles;
          visibleCount = 10;
          renderArticles();
          return;
        }

        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();

        filteredArticles = Array.isArray(data) ? data : [];

        visibleCount = 10;
        renderArticles();

      } catch (err) {
        console.error("Search error:", err);

        // fallback → restore original feed
        filteredArticles = originalArticles;
        visibleCount = 10;
        renderArticles();
      }
    }, 350);
  });
}

/* ================================================================
   DOMContentLoaded — single init
================================================================ */
document.addEventListener("DOMContentLoaded", () => {

  // Bookmark filter tabs
  document.querySelectorAll(".bk-filter").forEach(btn =>
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bk-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    })
  );

  // Digest toggles
  document.querySelectorAll(".digest-check").forEach(chk =>
    chk.addEventListener("click", () => {
      chk.classList.toggle("on");
      chk.classList.toggle("off");
      chk.textContent = chk.classList.contains("on") ? "✓" : "";
    })
  );

  initTheme();
  initPasswordUpdate();
  initDeleteAccount();

  if (sessionStorage.getItem("loggedIn") === "true") {
    loadUserProfile();
    showScreen("dashboard");
    loadArticles();
    setupSearch();
  } else {
    showScreen("login");
  }

  // Auto-refresh every 5 min
  setInterval(() => {
    if (sessionStorage.getItem("loggedIn") === "true") loadArticles();
  }, 300_000);
});
