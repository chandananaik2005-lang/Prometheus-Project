"use strict";

/* ================================================================
   PROMETHEUS TECH RADAR — app.js  (production-ready)
   Fully local AI chatbot · Multi-article memory · Zero external AI APIs
================================================================ */

/* ── API base URL ─────────────────────────────────────────────── */
const BACKEND_URL =
  window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1")
    ? window.location.port === "5000" ? "" : "http://localhost:5000"
    : "";

function getApiUrl(endpoint) {
  return `${BACKEND_URL}${endpoint}`;
}

/* ── Constants ─────────────────────────────────────────────────── */
const FALLBACK_IMAGE     = "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop";
const FETCH_TIMEOUT_MS   = 12000;
const MAX_RETRIES        = 2;
const MAX_MEMORY_DISPLAY = 200;

/* ── Global state ──────────────────────────────────────────────── */
let allArticles        = [];
let originalArticles   = [];
let filteredArticles   = [];
let visibleCount       = 10;
let currentArticle     = null;
let backendOnline      = true;
let chatbotBusy        = false;

/* ── In-browser article memory (mirrors server-side store) ─────── */
let openedArticleMemory = [];

/* ================================================================
   FETCH WITH TIMEOUT + RETRY
================================================================ */
async function fetchWithTimeout(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      const isLast = attempt === retries;
      if (isLast) throw err;
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

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
   TOAST
================================================================ */
function showToast(msg, type = "info") {
  let t = document.getElementById("_toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "_toast";
    Object.assign(t.style, {
      position:   "fixed",
      bottom:     "32px",
      left:       "50%",
      transform:  "translateX(-50%) translateY(100px)",
      background: "#1a1a1a",
      color:      "#f0f0f0",
      padding:    "12px 26px",
      borderRadius: "10px",
      fontSize:   "14px",
      fontFamily: "inherit",
      zIndex:     "99999",
      transition: "transform .3s ease",
      border:     "1px solid #333",
      boxShadow:  "0 8px 32px rgba(0,0,0,.5)",
      whiteSpace: "nowrap",
      pointerEvents: "none"
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
   OFFLINE BANNER
================================================================ */
function showOfflineBanner(show) {
  let banner = document.getElementById("_offlineBanner");
  if (!banner && show) {
    banner = document.createElement("div");
    banner.id = "_offlineBanner";
    Object.assign(banner.style, {
      position:   "fixed",
      top:        "0",
      left:       "0",
      right:      "0",
      background: "#ef4444",
      color:      "#fff",
      textAlign:  "center",
      padding:    "10px 16px",
      fontSize:   "13px",
      fontWeight: "600",
      zIndex:     "999999",
      boxShadow:  "0 2px 8px rgba(0,0,0,.3)"
    });
    banner.innerHTML = `⚠️ Backend server is offline — showing cached data. <button onclick="loadArticles()" style="margin-left:12px;padding:4px 12px;border:1px solid #fff;background:transparent;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;">Retry</button>`;
    document.body.prepend(banner);
  } else if (banner && !show) {
    banner.remove();
  }
}


/* ================================================================
   AUTH
================================================================ */
function login() {

  const email = (document.getElementById("login-email")?.value || "").trim();
  const password = document.getElementById("login-password")?.value || "";

  // Error elements
  const emailError = document.getElementById("email-error");
  const passwordError = document.getElementById("password-error");

  // Clear previous errors
  emailError.innerText = "";
  passwordError.innerText = "";

  let isValid = true;

  // Email regex validation
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Email validation
  if (!email) {
    emailError.innerText = "Email is required";
    isValid = false;
  }
  else if (!emailPattern.test(email)) {
    emailError.innerText = "Enter valid email address";
    isValid = false;
  }

  // Password validation
  if (!password) {
    passwordError.innerText = "Password is required";
    isValid = false;
  }
  else if (password.length < 8) {
    passwordError.innerText = "Password must contain minimum 8 characters";
    isValid = false;
  }

  // Stop if validation fails
  if (!isValid) return;

  // Existing login code
  const stored = JSON.parse(localStorage.getItem("prom_user") || "null");

  if (!stored) {
    showToast("No account found — sign up first.", "error");
    return;
  }

  if (email !== stored.email || password !== stored.password) {
    showToast("Wrong email or password.", "error");
    return;
  }

  sessionStorage.setItem("loggedIn", "true");

  loadUserProfile();
  showScreen("dashboard");
  loadArticles();
  setupSearch();
}

function signup() {

  const name = (document.getElementById("signup-name")?.value || "").trim();
  const email = (document.getElementById("signup-email")?.value || "").trim();
  const password = document.getElementById("signup-password")?.value || "";
  const confirm = document.getElementById("signup-confirm")?.value || "";

  // Email validation regex
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!name || !email || !password || !confirm) {
    showToast("Please fill all fields.", "error");
    return;
  }

  if (!emailPattern.test(email)) {
    showToast("Enter valid email address.", "error");
    return;
  }

  if (password !== confirm) {
    showToast("Passwords do not match.", "error");
    return;
  }

  if (password.length < 8) {
    showToast("Password needs 8+ characters.", "error");
    return;
  }

  localStorage.setItem(
    "prom_user",
    JSON.stringify({ name, email, password })
  );

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
  ["topbarAvatar", "articleAvatar2"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });
  const avatarEl = document.getElementById("profileAvatar");
  if (avatarEl) {
    const tn = [...avatarEl.childNodes].find(n => n.nodeType === 3);
    if (tn) tn.nodeValue = user.name.charAt(0).toUpperCase();
  }
  const nameEl  = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  if (nameEl)  nameEl.textContent  = user.name;
  if (emailEl) emailEl.textContent = user.email;
}

/* bookmarkCurrentArticle, shareCurrentArticle defined below near renderBookmarks */

/* ================================================================
   SETTINGS
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
    if (cur !== user.password) { showToast("Current password wrong ❌", "error"); return; }
    if (newP !== conf)    { showToast("New passwords don't match ❌", "error"); return; }
    if (newP.length < 6)  { showToast("Min 6 characters ⚠️", "warn");          return; }
    user.password = newP;
    localStorage.setItem("prom_user", JSON.stringify(user));
    showToast("Password updated ✅", "success");
    ["currentPass", "newPass", "confirmPass"].forEach(id => {
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
   IMAGE HELPER
================================================================ */
function safeImg(article) {
  if (!article) return FALLBACK_IMAGE;
  const candidates = [article.image_url, article.urlToImage, article.image];
  for (let img of candidates) {
    if (!img || typeof img !== "string") continue;
    img = img.trim();
    if (!img) continue;
    if (!img.startsWith("http") && !img.startsWith("data:image")) continue;
    if (img.startsWith("data:image")) {
      if (
        img.includes("PCFET0NUWVBFIGh0bWw") ||
        img.includes("PGh0bWw") ||
        img.toLowerCase().includes("doctype") ||
        img.toLowerCase().includes("<html")
      ) continue;
      return img;
    }
    const low = img.toLowerCase();
    if (
      low.includes("picsum.photos") ||
      low.includes("placeholder") ||
      low.includes("broken") ||
      low.includes("example.com") ||
      low.includes("mock") ||
      img.length < 14
    ) continue;
    return img;
  }
  return FALLBACK_IMAGE;
}

/* ================================================================
   HELPERS
================================================================ */
function isEnglish(text) {
  if (!text || text.length < 5) return false;
  return (text.match(/[a-zA-Z]/g) || []).length / text.length > 0.45;
}

function isTechArticle(a) {
  const t = ((a.title || "") + " " + (a.description || "")).toLowerCase();
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
  if (m < 1)     return "just now";
  if (m < 60)    return `${m}m ago`;
  if (m < 1440)  return `${Math.floor(m / 60)}h ago`;
  if (m < 10080) return `${Math.floor(m / 1440)}d ago`;
  return d.toLocaleDateString();
}

/* ================================================================
   SECTION HEADING DETECTION
================================================================ */
const SECTION_HEADING_RE = /^(section\s*\d+|overview|background(\s+and\s+context)?|key\s+developments|technical\s+deep\s+dive|economic\s+dimensions|future\s+outlook|conclusion|introduction|summary)[\s:.\-]*$/i;

/* ================================================================
   ARTICLE CONTENT FORMATTER
   Produces only clean 3–4 paragraphs — never fake headings
================================================================ */
function formatArticleContent(raw) {
  if (!raw) return `<p class="article-paragraph">No content available.</p>`;

  /* If already properly formatted by server, strip any heading-like nodes and return */
  if (raw.includes("article-paragraph")) {
    return raw
      .replace(/<p[^>]*>\s*(Section\s*\d+|Overview|Background[^<]*|Key Developments|Technical Deep Dive|Economic Dimensions|Future Outlook|Conclusion|Introduction|Summary)\s*<\/p>/gi, "")
      .replace(/<h[1-6][^>]*>[^<]*<\/h[1-6]>/gi, "");
  }

  /* Strip all HTML and reconstruct into clean paragraphs */
  const text = raw
    .replace(/<h[1-6][^>]*>[^<]*<\/h[1-6]>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawSentences = text.split(/(?<=[.!?])\s+/);
  const sentences    = [];
  const seen         = new Set();

  for (let s of rawSentences) {
    s = s.trim();
    if (s.length < 28) continue;
    if (SECTION_HEADING_RE.test(s)) continue;
    const key = s.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    sentences.push(s);
  }

  if (sentences.length < 2) {
    return `<p class="article-paragraph">${text || "No content available."}</p>`;
  }

  const n = sentences.length;
  let p1, p2, p3;
  if (n >= 6) {
    const c = Math.ceil(n / 3);
    p1 = sentences.slice(0, c).join(" ");
    p2 = sentences.slice(c, c * 2).join(" ");
    p3 = sentences.slice(c * 2).join(" ");
  } else {
    const c = Math.ceil(n / 2);
    p1 = sentences.slice(0, c).join(" ");
    p2 = sentences.slice(c).join(" ");
  }

  let html = `<p class="article-paragraph">${p1}</p>`;
  if (p2 && p2.trim()) html += `\n<p class="article-paragraph">${p2}</p>`;
  if (p3 && p3.trim()) html += `\n<p class="article-paragraph">${p3}</p>`;
  return html;
}

/* ================================================================
   MARKDOWN PARSER (chatbot responses)
================================================================ */
function formatMarkdown(text) {
  if (!text) return "";

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  /* Bold and italic */
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.*?)__/g,     "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g,     "<em>$1</em>");
  html = html.replace(/_(.*?)_/g,       "<em>$1</em>");

  /* Lists and line breaks */
  const lines = html.split(/\r?\n/);
  let inList  = false;
  const out   = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (/^[-*•]\s+/.test(trimmed)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${trimmed.replace(/^[-*•]\s+/, "")}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      if (trimmed === "") {
        out.push("<br>");
      } else {
        out.push(`<span>${trimmed}</span>`);
      }
    }
  }
  if (inList) out.push("</ul>");

  return out.join(" ");
}

/* ================================================================
   ARTICLE MEMORY — store opened article in server & browser cache
================================================================ */
async function storeOpenedArticle(article) {
  if (!article || !article.title) return;

  /* 1. Build the clean entry FIRST (fixes undefined `entry` reference) */
  const entry = {
    title:       article.title       || "",
    description: article.description || "",
    content:     (article.content    || "").replace(/<[^>]*>/g, " ").slice(0, 6000),
    category:    article.category    || "technology",
    source:      article.source      || "Unknown",
    openedAt:    Date.now()
  };

  /* 2. Deduplicate — remove existing copy if present, then prepend newest */
  const existingIdx = openedArticleMemory.findIndex(
    a => (a.title || "").toLowerCase().trim() === entry.title.toLowerCase().trim()
  );
  if (existingIdx !== -1) openedArticleMemory.splice(existingIdx, 1);
  openedArticleMemory.unshift(entry);

  /* 3. Trim memory to cap */
  if (openedArticleMemory.length > MAX_MEMORY_DISPLAY) {
    openedArticleMemory = openedArticleMemory.slice(0, MAX_MEMORY_DISPLAY);
  }

  /* 4. Persist to localStorage */
  try {
    localStorage.setItem("prom_article_memory", JSON.stringify(openedArticleMemory));
  } catch (_) {}

  /* 5. Mark visited state for feed cards */
  markArticleVisited(entry.title);

  /* 6. Live-refresh research history if settings panel is open */
  const settingsScreen = document.getElementById("screen-settings");
  if (settingsScreen && settingsScreen.classList.contains("active")) {
    loadResearchHistory();
  }

  /* 6. Send clean POST to backend (fire-and-forget, never blocks UI) */
  try {
    fetchWithTimeout(getApiUrl("/api/store-opened-article"), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:       entry.title,
        description: entry.description,
        content:     entry.content,
        category:    entry.category,
        source:      entry.source
      })
    }).catch(() => {});
  } catch (_) {}
}

/* ── Persist & restore visited article titles across refreshes ── */
function markArticleVisited(title) {
  if (!title) return;
  const visited = getVisitedTitles();
  visited.add(title.toLowerCase().trim());
  try {
    localStorage.setItem("prom_visited", JSON.stringify([...visited]));
  } catch (_) {}
  /* Live-update any matching feed card already in the DOM */
  document.querySelectorAll(".feed-item").forEach(card => {
    const hl = card.querySelector(".feed-headline");
    if (hl && hl.textContent.trim().toLowerCase() === title.toLowerCase().trim()) {
      card.classList.add("feed-item--visited");
    }
  });
}

function getVisitedTitles() {
  try {
    return new Set(JSON.parse(localStorage.getItem("prom_visited") || "[]"));
  } catch (_) { return new Set(); }
}

/* ================================================================
   AI SUMMARY
================================================================ */
async function generateAISummary(article) {
  const el = document.getElementById("aiSummary");
  if (!el) return;
  el.innerHTML = `<span style="opacity:0.6;font-style:italic;">Generating summary…</span>`;

  try {
    const res = await fetchWithTimeout(getApiUrl("/api/article-chat"), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Give a concise 3-sentence summary highlighting the key points and implications.",
        article:  {
          title:       article.title,
          description: article.description,
          content:     (article.content || "").replace(/<[^>]*>/g, " ").slice(0, 4000)
        }
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    el.innerHTML = formatMarkdown(data.response || "Summary unavailable.");
  } catch {
    el.innerHTML = formatMarkdown(
      `**${article.title}** — ${article.description || "No summary available."}`
    );
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

  relatedEl.innerHTML = related.map(item => `
    <div class="intel-card" data-title="${(item.title || "").replace(/"/g, "&quot;")}" style="cursor:pointer;">
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
   CHATBOT
================================================================ */
function quickAsk(question) {
  const input = document.getElementById("chatInput");
  if (input) { input.value = question; askArticleBot(); }
}

async function askArticleBot() {
  /* Prevent double-submit */
  if (chatbotBusy) return;

  const input = document.getElementById("chatInput");
  const box   = document.getElementById("chatMessages");
  if (!input || !box) return;

  const question = input.value.trim();
  if (!question) return;

  chatbotBusy = true;
  input.value = "";

  /* ── User bubble ─────────────────────────────────────────────── */
  const userDiv = document.createElement("div");
  userDiv.className = "chat-user";
  userDiv.textContent = question;
  box.appendChild(userDiv);
  box.scrollTop = box.scrollHeight;

  /* ── Loading indicator ───────────────────────────────────────── */
  const thinkDiv = document.createElement("div");
  thinkDiv.className = "chat-bot";
  thinkDiv.innerHTML = `<span class="chat-loading-dots"><span>.</span><span>.</span><span>.</span></span>`;
  box.appendChild(thinkDiv);
  box.scrollTop = box.scrollHeight;

  /* Ensure loading dots CSS exists */
  if (!document.getElementById("_chatDotCSS")) {
    const style = document.createElement("style");
    style.id = "_chatDotCSS";
    style.textContent = `
      .chat-loading-dots { display:inline-flex; gap:2px; align-items:center; }
      .chat-loading-dots span {
        display:inline-block; width:5px; height:5px; border-radius:50%;
        background:currentColor; opacity:0.3;
        animation:dotBounce 1.2s infinite;
      }
      .chat-loading-dots span:nth-child(2) { animation-delay:.2s; }
      .chat-loading-dots span:nth-child(3) { animation-delay:.4s; }
      @keyframes dotBounce {
        0%,80%,100% { opacity:0.3; transform:scale(0.85); }
        40%         { opacity:1;   transform:scale(1.1); }
      }
    `;
    document.head.appendChild(style);
  }

  try {
    /* Build article payload — include current article if open */
    const articlePayload = currentArticle ? {
      title:       currentArticle.title       || "",
      description: currentArticle.description || "",
      content:     (currentArticle.content    || "").replace(/<[^>]*>/g, " ").slice(0, 5000),
      source:      currentArticle.source      || ""
    } : {};

    /* Include opened article memory for cross-article context */
    const memoryPayload = openedArticleMemory.slice(0, 15).map(a => ({
      title:       a.title       || "",
      description: a.description || "",
      content:     (a.content    || "").slice(0, 1500),
      source:      a.source      || "",
      openedAt:    a.openedAt    || 0
    }));

    const res = await fetchWithTimeout(getApiUrl("/api/article-chat"), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ question, article: articlePayload, memory: memoryPayload })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
typeWriterEffect(
  thinkDiv,
  formatMarkdown(data.response || "No response generated.")
);
  } catch (err) {
    /* Graceful in-browser fallback — never shows error to user */
    const fallbackResponse = localBrowserQA(question, currentArticle || {});
    thinkDiv.innerHTML = fallbackResponse;
  }

  thinkDiv.style.opacity = "1";
  chatbotBusy = false;
  box.scrollTop = box.scrollHeight;
}

/* ── Browser-side local QA fallback (when backend is unreachable) ── */
function localBrowserQA(question, article) {
  const title   = article.title       || "";
  const desc    = article.description || "";
  const content = (article.content    || "").replace(/<[^>]*>/g, " ");

  const isMulti = /all article|every article|compare|between|both|everything|overall|summary of all|what do you know|summarize|today/i.test(question);

  /* Build corpus from current article + memory */
  let corpusSources = [];
  if (title || desc || content) {
    corpusSources.push({ label: title || "Current Article", text: `${title}. ${desc}. ${content}`, weight: 2 });
  }
  if (openedArticleMemory.length > 0) {
    openedArticleMemory.forEach(a => {
      corpusSources.push({
        label: a.title || "Memory Article",
        text:  `${a.title}. ${a.description}. ${(a.content || "").slice(0, 1200)}`,
        weight: 1
      });
    });
  }

  const stopwords = new Set([
    "what","is","the","a","an","and","or","but","if","then","how","why","who","where","when",
    "does","do","did","can","could","would","should","will","of","to","in","for","on","with",
    "at","by","from","about","as","into","like","after","before","this","that","it","its","be",
    "across","all","articles","opened","read","remember","recalled","previous","every","both",
    "tell","me","please","give","explain","describe","summarize"
  ]);

  const qWords = question.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/)
    .filter(w => w.length > 1 && !stopwords.has(w));
  const qSet = new Set(qWords.length ? qWords : question.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  /* Score every sentence across all sources */
  const allScored = [];
  corpusSources.forEach(({ label, text, weight }) => {
    const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20);
    sentences.forEach((s, i) => {
      const sWords = new Set(s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/));
      let overlap = 0;
      for (const w of qSet) if (sWords.has(w)) overlap++;
      /* Bonus for bigram matches */
      let bigramBonus = 0;
      const sArr = [...sWords];
      for (let j = 0; j < qWords.length - 1; j++) {
        if (sArr.includes(qWords[j]) && sArr.includes(qWords[j + 1])) bigramBonus += 0.3;
      }
      const score = (qSet.size > 0 ? (overlap / qSet.size) + bigramBonus : 0) * weight;
      allScored.push({ s, score, label, i });
    });
  });

  /* Deduplicate and take top results */
  const seen = new Set();
  const top = allScored
    .filter(x => x.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .filter(x => { const k = x.s.slice(0, 60).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 4);

  let answer;
  if (top.length >= 2) {
    /* Group by source for comparison queries */
    const bySource = {};
    top.forEach(x => {
      if (!bySource[x.label]) bySource[x.label] = [];
      bySource[x.label].push(x.s);
    });
    const sources = Object.keys(bySource);
    if (isMulti && sources.length > 1) {
      answer = sources.map(src => `**${src}**\n${bySource[src].map(s => `• ${s}`).join("\n")}`).join("\n\n");
    } else {
      answer = top.sort((a, b) => a.i - b.i).map(x => `• ${x.s}`).join("\n\n");
    }
    if (openedArticleMemory.length > 1) {
      answer += `\n\n*Drawing from ${openedArticleMemory.length} articles in your reading session.*`;
    }
  } else if (top.length === 1) {
    answer = top[0].s;
  } else if (title) {
    answer = `Based on **"${title}"**: ${desc || "No additional details available."}`;
  } else if (openedArticleMemory.length > 0) {
    const topics = openedArticleMemory.slice(0, 5).map(a => `• **${a.title}**`).join("\n");
    answer = `You've read these articles in this session:\n\n${topics}\n\nAsk me anything about any of these topics.`;
  } else {
    answer = "Please open an article first, then ask me questions about it.";
  }

  return formatMarkdown(answer + "\n\n*⚠️ Offline mode — server temporarily unreachable.*");
}

/* ── Enter key sends chat message ─────────────────────────────── */
function initChatInput() {
  const input = document.getElementById("chatInput");
  if (!input) return;
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askArticleBot();
    }
  });
}
/* ================================================================
   TYPEWRITER EFFECT — preserves full HTML/markdown, no flickering
================================================================ */
function typeWriterEffect(element, html, speed = 6) {
  element.innerHTML = "";

  /* Extract plain text for character-by-character animation */
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const plainText = temp.innerText || temp.textContent || "";

  let i = 0;
  element.style.whiteSpace = "pre-wrap";

  const interval = setInterval(() => {
    /* Show plain text while typing for smooth effect */
    element.textContent = plainText.slice(0, i + 1);
    i++;

    if (i >= plainText.length) {
      clearInterval(interval);
      /* Swap to full formatted HTML once typing completes */
      element.style.whiteSpace = "";
      element.innerHTML = html;
    }
  }, speed);
}
/* ================================================================
   SEARCH — debounced, backend + local fallback, relevance ranked
================================================================ */
function setupSearch() {
  const box = document.getElementById("searchBox");
  if (!box) return;

  let timer;
  box.addEventListener("input", (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();

    if (q.length < 2) {
      filteredArticles = originalArticles;
      visibleCount = 10;
      renderArticles();
      return;
    }

    timer = setTimeout(async () => {
      try {
        const res = await fetchWithTimeout(getApiUrl(`/api/search?q=${encodeURIComponent(q)}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let results = Array.isArray(data) ? data : (data.articles || []);
        filteredArticles = rankByRelevance(results, q);
      } catch {
        filteredArticles = rankByRelevance(originalArticles.filter(a => {
          const haystack = ((a.title || "") + " " + (a.description || "")).toLowerCase();
          return fuzzyMatch(haystack, q.toLowerCase());
        }), q);
      }
      visibleCount = 10;
      renderArticles();
    }, 280);
  });
}

function fuzzyMatch(haystack, query) {
  /* Check direct inclusion first */
  if (haystack.includes(query)) return true;
  /* Tolerate 1-char typo by checking each word */
  const words = query.split(/\s+/).filter(w => w.length > 2);
  return words.every(word => {
    if (haystack.includes(word)) return true;
    /* Check word variants within 1 edit distance for words > 4 chars */
    if (word.length > 4) {
      return haystack.split(/\s+/).some(hw => editDistance(hw, word) <= 1);
    }
    return false;
  });
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function rankByRelevance(articles, query) {
  const ql = query.toLowerCase();
  const words = ql.split(/\s+/).filter(w => w.length > 1);
  return articles
    .map(a => {
      const title = (a.title || "").toLowerCase();
      const desc  = (a.description || "").toLowerCase();
      let score = 0;
      if (title.includes(ql)) score += 10;
      if (desc.includes(ql))  score += 5;
      words.forEach(w => {
        if (title.includes(w)) score += 3;
        if (desc.includes(w))  score += 1;
      });
      return { a, score };
    })
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map(x => x.a);
}

/* ================================================================
   LOAD ARTICLES
================================================================ */
async function loadArticles() {
  const container = document.getElementById("news-container");
  if (!container) return;

  /* Skeleton loader */
  container.innerHTML = [1, 2, 3, 4].map(() => `
    <div style="display:flex;gap:14px;padding:16px;background:var(--surface);border-radius:12px;margin-bottom:12px;">
      <div style="width:120px;height:80px;background:var(--surface2);border-radius:8px;flex-shrink:0;animation:pulse 1.4s ease-in-out infinite;"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center;">
        <div style="height:11px;background:var(--surface2);border-radius:4px;width:55%;animation:pulse 1.4s ease-in-out infinite;"></div>
        <div style="height:15px;background:var(--surface2);border-radius:4px;width:90%;animation:pulse 1.4s ease-in-out infinite;"></div>
        <div style="height:11px;background:var(--surface2);border-radius:4px;width:70%;animation:pulse 1.4s ease-in-out infinite;"></div>
      </div>
    </div>`).join("");

  try {
    const res = await fetchWithTimeout(getApiUrl(`/api/articles?t=${Date.now()}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let data = await res.json();
    /* Support both raw array and { articles: [] } responses */
    let arts = Array.isArray(data) ? data : (data.articles || []);

    /* Client-side dedup */
    const seen = new Set();
    arts = arts.filter(a => {
      if (!a || !a.title || !a.description) return false;
      const k = a.title.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    backendOnline    = true;
    showOfflineBanner(false);

    originalArticles = arts;
    filteredArticles = arts;
    allArticles      = arts;
    visibleCount     = 10;
    renderArticles();

  } catch (err) {
    console.error("loadArticles error:", err);
    backendOnline = false;
    showOfflineBanner(true);

    if (allArticles.length) {
      renderArticles();
    } else {
      container.innerHTML = `
        <div style="padding:36px;text-align:center;background:var(--surface);border-radius:12px;">
          <div style="font-size:40px;">📡</div>
          <div style="font-weight:700;margin:12px 0 6px;color:var(--text1);font-size:17px;">Server is starting up</div>
          <div style="font-size:13px;color:#888;margin-bottom:18px;">The backend may still be initializing. Please try again in a moment.</div>
          <button onclick="loadArticles()"
            style="padding:9px 24px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">
            Retry
          </button>
        </div>`;
    }
  }
}

/* ================================================================
   RENDER ARTICLES
================================================================ */
function renderArticles() {
  const container = document.getElementById("news-container");
  if (!container) return;
  container.innerHTML = "";

  const list = filteredArticles.length ? filteredArticles : allArticles;

  if (!list.length) {
    container.innerHTML = `
      <div style="padding:40px;text-align:center;color:#888;">
        <div style="font-size:32px;margin-bottom:10px;">📭</div>
        No articles yet — check back shortly.
      </div>`;
    return;
  }

  const visited = getVisitedTitles();

  list.slice(0, visibleCount).forEach(article => {
    if (!article || !article.title) return;

    const card = document.createElement("div");
    const isVisited = visited.has(article.title.toLowerCase().trim());
    card.className = "feed-item" + (isVisited ? " feed-item--visited" : "");
    const img  = safeImg(article);
    const raw  = (article.content || article.description || "").replace(/<[^>]*>/g, " ");
    const mins = Math.max(1, Math.ceil(raw.split(/\s+/).filter(Boolean).length / 200));

    card.innerHTML = `
      <div class="feed-card-exact">
        <div class="feed-left-box">
          <img class="feed-thumb-exact" src="${img}" loading="lazy"
               onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}';">
        </div>
        <div class="feed-right">
          <div class="feed-meta">
            <span class="feed-brand">${article.source || "Prometheus"}</span>
            <span class="feed-sep">•</span>
            <span class="feed-age">${timeAgo(article.published_at)}</span>
          </div>
          <div class="feed-headline">${article.title}</div>
          <div class="feed-desc">${(article.description || "").slice(0, 160)}${(article.description || "").length > 160 ? "…" : ""}</div>
          <div class="feed-pill-row">
            <span>${article.category || "Technology"}</span>
            <span>${mins} min read</span>
          </div>
        </div>
      </div>`;

    card.addEventListener("click", () => openArticle(article));
    container.appendChild(card);
  });

  const btn = document.getElementById("load-more");
  if (btn) {
    btn.style.display = visibleCount >= list.length ? "none" : "block";
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
  article.visited = true;
  if (!article) return;
  currentArticle = article;
  showScreen("article");

  const img = safeImg(article);

  /* Set metadata */
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl("articleTitle",    article.title    || "Untitled");
  setEl("articleCategory", article.category || "Technology");
  setEl("articleAuthor",   article.source   || "Prometheus AI");
  setEl("articleDate",     timeAgo(article.published_at));
  setEl("articleAvatarIcon", (article.source || "AI").substring(0, 2).toUpperCase());

  /* Hero image */
  const imageEl = document.getElementById("articleImage");
  if (imageEl) {
    imageEl.innerHTML = `<img src="${img}" class="article-hero-img"
      style="width:100%;max-height:380px;object-fit:cover;border-radius:12px;display:block;"
      onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}';">`;
  }

  /* Article content — clean 3–4 paragraphs, zero fake headings */
  const raw       = article.content || article.description || "No content available.";
  const formatted = formatArticleContent(raw);

  const contentEl = document.getElementById("articleContent");
  if (contentEl) {
    contentEl.innerHTML = `<div class="article-wrapper">${formatted}</div>`;
  }

  /* Clear chat */
  const chatBox = document.getElementById("chatMessages");
  if (chatBox) chatBox.innerHTML = "";

  /* Store opened article in memory (async, non-blocking) */
  storeOpenedArticle(article);

  /* AI summary */
  generateAISummary(article);

  /* Related articles */
  renderIntelHub(article);
}

/* ================================================================
   DYNAMIC PROMPT PROMETHEUS WIDGET
================================================================ */
async function refreshPrometheusPrompts() {
  const container = document.getElementById("prometheusWidget");
  if (!container) return;

  /* Try AI-generated prompts from backend first */
  let prompts = [];
  try {
    const headlines    = allArticles.slice(0, 20).map(a => a.title).filter(Boolean);
    const openedTitles = openedArticleMemory.slice(0, 5).map(a => a.title).filter(Boolean);

    if (headlines.length) {
      const res = await fetchWithTimeout(getApiUrl("/api/generate-prompts"), {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ headlines, openedTitles }),
      });
      const data = await res.json();
      if (Array.isArray(data.prompts) && data.prompts.length >= 2) {
        prompts = data.prompts.slice(0, 4);
      }
    }
  } catch (_) {}

  /* Fall back to client-side prompt generation */
  if (prompts.length < 4) prompts = buildDynamicPrompts();

  /* Update the prompt items in DOM */
  const items = container.querySelectorAll(".prompt-item");
  items.forEach((el, i) => {
    const p = prompts[i];
    if (p) {
      el.innerHTML = `${p} <span>›</span>`;
      el.onclick = () => sendPrometheusPrompt(p);
    }
  });

  /* Update note */
  const note = container.querySelector(".prompt-note");
  if (note) {
    const count = allArticles.length;
    note.textContent = count
      ? `Synthesizing context from ${count} live articles in your feed.`
      : "Assistant is ready to synthesize context from your feed.";
  }
}

function buildDynamicPrompts() {
  if (!allArticles.length) {
    return [
      "Summarize today's AI breakthroughs",
      "Find funding news in Robotics",
      "Explain latest NVIDIA results",
      "Analyze sentiment on Web3"
    ];
  }

  const prompts = [];

  /* Extract top companies/entities mentioned in titles */
  const entityRe = /\b(NVIDIA|OpenAI|Google|Apple|Microsoft|Meta|Tesla|Amazon|Intel|AMD|Samsung|Anthropic|Gemini|ChatGPT|GPT|Llama|Mistral|Hugging Face|SpaceX|xAI|Grok)\b/gi;
  const entities = {};
  allArticles.forEach(a => {
    const matches = ((a.title || "") + " " + (a.description || "")).match(entityRe) || [];
    matches.forEach(e => { const k = e.toLowerCase(); entities[k] = (entities[k] || 0) + 1; });
  });
  const topEntities = Object.entries(entities).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

  /* Extract top categories */
  const catCount = {};
  allArticles.forEach(a => { const c = a.category || "technology"; catCount[c] = (catCount[c] || 0) + 1; });
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);

  /* Build smart prompts */
  if (topEntities.length >= 2) {
    const [e1, e2] = topEntities;
    prompts.push(`Compare ${capitalize(e1)} and ${capitalize(e2)} strategies`);
  }
  if (topCats.length) {
    prompts.push(`Summarize all ${topCats[0]} news today`);
  }
  if (openedArticleMemory.length >= 2) {
    prompts.push("Compare the last two articles I read");
  } else {
    prompts.push("What are investors focusing on this week?");
  }
  if (topEntities.length >= 1) {
    prompts.push(`Explain ${capitalize(topEntities[0])}'s latest AI direction`);
  } else {
    prompts.push("Which startup raised the most funding?");
  }

  /* Pad with fallbacks if needed */
  const fallbacks = [
    "Summarize today's AI breakthroughs",
    "Find cybersecurity threats today",
    "What is the most important tech story?",
    "Explain the latest quantum computing news"
  ];
  while (prompts.length < 4) prompts.push(fallbacks[prompts.length]);

  return prompts.slice(0, 4);
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sendPrometheusPrompt(prompt) {
  /* Navigate to article screen if not there, or use dashboard chatbot */
  const chatInput = document.getElementById("chatInput");
  if (chatInput) {
    /* Scroll to article screen chatbot if visible */
    const articleScreen = document.getElementById("screen-article");
    if (articleScreen && articleScreen.classList.contains("active")) {
      chatInput.value = prompt;
      chatInput.focus();
      askArticleBot();
      return;
    }
  }

  /* If on dashboard, create a floating answer */
  showPrometheusAnswer(prompt);
}

async function showPrometheusAnswer(prompt) {
  /* Show a toast to indicate we're processing */
  showToast("Prometheus is thinking…", "info");

  /* Reuse the article chat endpoint with full memory context */
  const memoryPayload = openedArticleMemory.slice(0, 10).map(a => ({
    title: a.title, description: a.description,
    content: (a.content || "").slice(0, 1200), source: a.source
  }));

  try {
    const res = await fetchWithTimeout(getApiUrl("/api/article-chat"), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        question: prompt,
        article:  currentArticle ? {
          title: currentArticle.title, description: currentArticle.description,
          content: (currentArticle.content || "").replace(/<[^>]*>/g, " ").slice(0, 3000)
        } : {},
        memory: memoryPayload
      })
    });
    const data = await res.json();
    showPrometheusModal(prompt, data.response || "No response generated.");
  } catch {
    showPrometheusModal(prompt, localBrowserQA(prompt, currentArticle || {}));
  }
}

function showPrometheusModal(question, answer) {
  /* Remove existing modal if any */
  document.getElementById("_prometheusModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "_prometheusModal";
  Object.assign(modal.style, {
    position: "fixed", inset: "0", zIndex: "99998",
    background: "rgba(0,0,0,0.65)", display: "flex",
    alignItems: "center", justifyContent: "center", padding: "20px"
  });

  const box = document.createElement("div");
  Object.assign(box.style, {
    background: "var(--surface)", borderRadius: "16px", padding: "28px",
    maxWidth: "620px", width: "100%", maxHeight: "80vh", overflowY: "auto",
    border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)"
  });

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
      <div style="font-size:13px;color:var(--accent);font-weight:700;letter-spacing:.05em;">✨ PROMPT PROMETHEUS</div>
      <button onclick="document.getElementById('_prometheusModal').remove()"
        style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div style="font-size:15px;font-weight:600;color:var(--text1);margin-bottom:14px;">${question}</div>
    <div id="_prometheusAnswer" style="font-size:14px;color:var(--text2);line-height:1.7;"></div>`;

  modal.appendChild(box);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  const answerEl = box.querySelector("#_prometheusAnswer");
  const html = typeof answer === "string" && answer.includes("<") ? answer : formatMarkdown(answer);
  typeWriterEffect(answerEl, html, 5);
}
/* ================================================================
   RENDER BOOKMARKS — dynamic, from localStorage
   MUST be global so onclick attributes and showScreen() can call it
================================================================ */
function renderBookmarks(filterCat) {
  const bk = JSON.parse(localStorage.getItem('prom_bookmarks') || '[]');
  const activeCat = filterCat || 'All';

  // ── Rebuild dynamic category filter chips ────────────────────────
  const filterBar = document.getElementById('bk-filter-bar');
  if (filterBar) {
    const cats = ['All', ...new Set(bk.map(b => b.category || 'Technology').filter(Boolean))];
    filterBar.innerHTML = cats.map(cat => `
      <button class="bk-filter ${cat === activeCat ? 'active' : ''}" data-cat="${cat}">${cat}</button>
    `).join('');
    filterBar.querySelectorAll('.bk-filter').forEach(btn => {
      btn.addEventListener('click', () => renderBookmarks(btn.dataset.cat));
    });
  }

  // ── Filter bookmarks by category ─────────────────────────────────
  const filtered = activeCat === 'All' ? bk : bk.filter(b => (b.category || 'Technology') === activeCat);

  // Update stat counters
  const statNums = document.querySelectorAll('#screen-bookmarks .bk-stat-num');
  if (statNums[0]) statNums[0].textContent = bk.length;
  if (statNums[1]) statNums[1].textContent = bk.filter(b => !b.read).length;
  if (statNums[2]) statNums[2].textContent = bk.filter(b => b.shared).length;
  if (statNums[3]) statNums[3].textContent = bk.filter(b => b.like).length;
  if (statNums[4]) statNums[4].textContent = bk.filter(b => b.pin).length;

  // Get or create the dynamic list container
  let listEl = document.getElementById('bk-dynamic-list');
  if (!listEl) {
    listEl = document.createElement('div');
    listEl.id = 'bk-dynamic-list';
    const pageContent = document.querySelector('#screen-bookmarks .page-content');
    if (pageContent) pageContent.appendChild(listEl);
  }

  const endMsg = document.getElementById('bk-end-msg');
  if (!filtered.length) {
    listEl.innerHTML = `
      <div style="padding:48px;text-align:center;color:var(--text3);">
        <div style="font-size:40px;margin-bottom:12px;">🔖</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:6px;">${bk.length ? 'No articles in this category' : 'No bookmarks yet'}</div>
        <div style="font-size:13px;">${bk.length ? 'Try a different filter.' : 'Open any article and click 🔖 to save it here.'}</div>
      </div>`;
    if (endMsg) endMsg.style.display = 'none';
    return;
  }
  if (endMsg) endMsg.style.display = 'block';

  // Pinned first
  const sorted = [...filtered].sort((a,b) => (b.pin?1:0) - (a.pin?1:0));

  listEl.innerHTML = sorted.map((item) => {
    const realIdx = bk.findIndex(b => b.title === item.title && b.savedAt === item.savedAt);
    const savedAgo = item.savedAt ? timeAgo(new Date(item.savedAt).toISOString()) : 'recently';
    const catColors = {
      'AI & ML':'ai2','Apple':'ai2','Mobile':'bio','Cybersecurity':'ai2',
      'Social Media':'bio','EV & Auto':'sust','Startups':'bio',
      'Gaming':'sust','Telecom':'sust','Crypto':'bio','General Tech':'ai2'
    };
    const thumbClass = catColors[item.category] || 'ai2';
    const thumbEmoji = {'ai2':'🤖','bio':'🧬','sust':'🔋'}[thumbClass] || '📰';
    return `
      <div class="bk-item" data-bk-idx="${realIdx}" data-bk-title="${(item.title||'').replace(/"/g,'&quot;')}" style="${item.pin ? 'border-left:3px solid var(--accent);' : ''}cursor:pointer;">
        <div class="bk-thumb ${thumbClass}">${thumbEmoji}</div>
        <div class="bk-info">
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <div class="bk-title">${item.title}</div>
            <span class="bk-tag gen-ai">${item.category || 'Tech'}</span>
          </div>
          <div class="bk-desc">${item.description || item.source || ''}</div>
          <div class="bk-meta">
            <span>Saved ${savedAgo}</span>
            <span>·</span>
            <span>${item.source || 'Prometheus'}</span>
            ${item.pin  ? '<span>· 📍 Pinned</span>'  : ''}
            ${item.read ? '<span>· ✅ Read</span>'    : ''}
          </div>
          <div style="display:flex;gap:10px;margin-top:12px;">
            <button onclick="event.stopPropagation();toggleLike(${realIdx})"
              style="border:none;background:var(--surface2);color:${item.like?'#ef4444':'white'};padding:8px 10px;border-radius:8px;cursor:pointer;">
              ${item.like ? '💖' : '❤️'}
            </button>
            <button onclick="event.stopPropagation();togglePin(${realIdx})"
              style="border:none;background:var(--surface2);color:${item.pin?'#f59e0b':'white'};padding:8px 10px;border-radius:8px;cursor:pointer;">
              ${item.pin ? '📍' : '📌'}
            </button>
            <button onclick="event.stopPropagation();toggleRead(${realIdx})"
              style="border:none;background:var(--surface2);color:white;padding:8px 10px;border-radius:8px;cursor:pointer;">
              ${item.read ? '☑' : '✔'}
            </button>
            <button onclick="event.stopPropagation();deleteBookmark(${realIdx})"
              style="border:none;background:var(--surface2);color:#ef4444;padding:8px 10px;border-radius:8px;cursor:pointer;">
              🗑
            </button>
          </div>
        </div>
        <span class="bk-ext">↗</span>
      </div>`;
  }).join('');

  // Wire up click-to-open for bookmarked articles
  listEl.querySelectorAll('.bk-item').forEach(el => {
    el.addEventListener('click', () => {
      const title = el.dataset.bkTitle;
      if (!title) return;
      const found = allArticles.find(a => (a.title || '').toLowerCase().trim() === title.toLowerCase().trim());
      if (found) { openArticle(found); return; }
      // Fallback: reconstruct from bookmark data
      const bkData = bk.find(b => (b.title || '').toLowerCase().trim() === title.toLowerCase().trim());
      if (bkData) {
        openArticle({
          title:       bkData.title,
          category:    bkData.category || 'Technology',
          source:      bkData.source || 'Prometheus',
          description: bkData.description || '',
          image_url:   bkData.image || null,
          url:         bkData.link || null,
          content:     bkData.description || '',
          published_at: bkData.savedAt ? new Date(bkData.savedAt).toISOString() : null
        });
      }
    });
  });
}

/* ================================================================
   RESEARCH HISTORY — shows opened articles (not bookmarks)
   MUST be global so showScreen() can call it
================================================================ */
function loadResearchHistory() {
  const container = document.getElementById('researchHistory');
  if (!container) return;

  // Always re-read from localStorage to get latest data
  try {
    const saved = localStorage.getItem('prom_article_memory');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Use localStorage version if it has more or equal items (handles page-reload case)
      if (parsed.length >= openedArticleMemory.length) openedArticleMemory = parsed;
    }
  } catch(_) {}

  const history = openedArticleMemory.length
    ? openedArticleMemory
    : [];

  container.innerHTML = '';

  if (!history.length) {
    container.innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--text3);">
        <div style="font-size:32px;margin-bottom:8px;">📖</div>
        <p style="font-size:13px;">No history yet. Open articles to see them here.</p>
      </div>`;
    return;
  }

  // Clear history button
  const clearBtn = document.createElement('button');
  clearBtn.textContent = '🗑 Clear History';
  clearBtn.style.cssText = 'display:block;margin-bottom:14px;padding:6px 14px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;';
  clearBtn.onclick = () => {
    if (!confirm('Clear all research history?')) return;
    openedArticleMemory = [];
    try { localStorage.removeItem('prom_article_memory'); } catch(_) {}
    loadResearchHistory();
    showToast('History cleared', 'success');
  };
  container.appendChild(clearBtn);

  const gradients = [
    'linear-gradient(135deg,#1e3a8a,#7c3aed)',
    'linear-gradient(135deg,#065f46,#0891b2)',
    'linear-gradient(135deg,#7c2d12,#b45309)',
    'linear-gradient(135deg,#1e1b4b,#be185d)',
    'linear-gradient(135deg,#14532d,#15803d)',
    'linear-gradient(135deg,#312e81,#1d4ed8)',
  ];

  history.slice(0, 12).forEach((item, i) => {
    const d = document.createElement('div');
    d.className = 'rh-thumb';
    d.style.background = gradients[i % gradients.length];
    d.style.cursor = 'pointer';
    d.title = item.title || 'Untitled';
    d.innerHTML = `
      <span class="rh-label">${item.category || 'Tech'}</span>
      <span class="rh-title">${item.title || 'Untitled'}</span>
      <span style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px;display:block;">
        ${item.openedAt ? timeAgo(new Date(item.openedAt).toISOString()) : ''}
        ${item.source ? '· ' + item.source : ''}
      </span>`;
    d.addEventListener('click', () => {
      const found = allArticles.find(a =>
        (a.title || '').toLowerCase().trim() === (item.title || '').toLowerCase().trim()
      );
      if (found) {
        openArticle(found);
      } else {
        openArticle({
          title:       item.title,
          category:    item.category || 'Technology',
          source:      item.source || 'Prometheus',
          description: item.description || '',
          content:     item.content || item.description || '',
          published_at: item.openedAt ? new Date(item.openedAt).toISOString() : null
        });
      }
    });
    container.appendChild(d);
  });
}

/* ================================================================
   BOOKMARK ACTIONS — all global so onclick attributes work
================================================================ */
function bookmarkCurrentArticle() {
  if (!currentArticle) { showToast('Open an article first.', 'warn'); return; }
  const bk  = JSON.parse(localStorage.getItem('prom_bookmarks') || '[]');
  const key = currentArticle.title;
  if (bk.find(b => b.title === key)) { showToast('Already bookmarked ✅', 'info'); return; }
  bk.unshift({
    title:       key,
    category:    currentArticle.category || detectArticleCategory(currentArticle),
    source:      currentArticle.source      || 'Prometheus',
    description: currentArticle.description || '',
    image:       currentArticle.image_url || currentArticle.urlToImage || currentArticle.image || null,
    link:        currentArticle.article_url || currentArticle.url || null,
    savedAt:     Date.now(),
    like: false, pin: false, read: false, shared: false
  });
  localStorage.setItem('prom_bookmarks', JSON.stringify(bk));
  showToast('Bookmarked! 🔖', 'success');
}

function shareCurrentArticle() {
  if (!currentArticle) return;
  const bk   = JSON.parse(localStorage.getItem('prom_bookmarks') || '[]');
  const item = bk.find(b => b.title === currentArticle.title);
  if (item) { item.shared = true; localStorage.setItem('prom_bookmarks', JSON.stringify(bk)); }
  if (navigator.share) {
    navigator.share({ title: currentArticle.title, text: currentArticle.description || '' });
  } else {
    navigator.clipboard?.writeText(window.location.href);
    showToast('Link copied!', 'success');
  }
}

function toggleLike(index) {
  const bk = JSON.parse(localStorage.getItem('prom_bookmarks') || '[]');
  if (!bk[index]) return;
  bk[index].like = !bk[index].like;
  localStorage.setItem('prom_bookmarks', JSON.stringify(bk));
  showToast(bk[index].like ? 'Added to favorites ❤️' : 'Removed from favorites', 'info');
  renderBookmarks();
}

function togglePin(index) {
  const bk = JSON.parse(localStorage.getItem('prom_bookmarks') || '[]');
  if (!bk[index]) return;
  bk[index].pin = !bk[index].pin;
  localStorage.setItem('prom_bookmarks', JSON.stringify(bk));
  showToast(bk[index].pin ? 'Article pinned 📌' : 'Article unpinned', 'info');
  renderBookmarks();
}

function toggleRead(index) {
  const bk = JSON.parse(localStorage.getItem('prom_bookmarks') || '[]');
  if (!bk[index]) return;
  bk[index].read = !bk[index].read;
  localStorage.setItem('prom_bookmarks', JSON.stringify(bk));
  showToast(bk[index].read ? 'Marked as read ✔' : 'Marked as unread', 'info');
  renderBookmarks();
}

function deleteBookmark(index) {
  const bk = JSON.parse(localStorage.getItem('prom_bookmarks') || '[]');
  if (!bk[index]) return;
  bk.splice(index, 1);
  localStorage.setItem('prom_bookmarks', JSON.stringify(bk));
  showToast('Bookmark removed 🗑', 'success');
  renderBookmarks();
}

/* ================================================================
   DOM READY — boot sequence
================================================================ */
document.addEventListener("DOMContentLoaded", () => {

  /* Restore article memory from localStorage on boot */
  try {
    const savedMemory = localStorage.getItem("prom_article_memory");
    if (savedMemory) openedArticleMemory = JSON.parse(savedMemory);
  } catch (_) {}

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
  initChatInput();

  if (sessionStorage.getItem("loggedIn") === "true") {
    loadUserProfile();
    showScreen("dashboard");
    loadArticles().then(() => refreshPrometheusPrompts()).catch(() => {});
    setupSearch();
  } else {
    showScreen("login");
  }
/* ═══════════════════════════════════════════════════════════════════
   ANALYTICS SCREEN  —  fully rewritten, all bugs fixed
   Bugs fixed:
   1. analyticsLoaded flag blocked re-renders after refresh
   2. Raw API articles have no .category — need client-side detection
   3. Stat cards used wrong CSS class "stat-value" (doesn't exist)
   4. Article distribution chart was clipped / wrong canvas height
   5. Source objects {name:...} not unwrapped consistently
   6. Date distribution section never rendered
   7. Charts not destroyed before innerHTML wipe → stale canvas ID
   8. Refresh button wired properly, uses allArticles (no double fetch)
═══════════════════════════════════════════════════════════════════ */
let analyticsLoaded = false;
let catChartInstance = null;
let srcChartInstance = null;
let dateChartInstance = null;

/* Category detector — mirrors NewsContext.jsx detectCategory() */
function detectArticleCategory(a) {
  if (a.category && a.category !== 'technology' && a.category !== 'General Tech' && a.category !== 'general')
    return a.category;
  const t = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
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

const ANALYTICS_CAT_COLORS = {
  'AI & ML':       '#7f77dd',
  'Apple':         '#888780',
  'Mobile':        '#378add',
  'Cybersecurity': '#d85a30',
  'Social Media':  '#d4537e',
  'EV & Auto':     '#639922',
  'Startups':      '#ba7517',
  'Gaming':        '#1d9e75',
  'Telecom':       '#1d9e75',
  'Crypto':        '#ba7517',
  'General Tech':  '#5f5e5a',
};
const DONUT_COLORS = ['#7f77dd','#378add','#d85a30','#d4537e','#639922','#ba7517','#1d9e75','#5f5e5a','#e8a838','#3dbccc'];

function destroyAnalyticsCharts() {
  if (catChartInstance)  { try { catChartInstance.destroy();  } catch(_){} catChartInstance  = null; }
  if (srcChartInstance)  { try { srcChartInstance.destroy();  } catch(_){} srcChartInstance  = null; }
  if (dateChartInstance) { try { dateChartInstance.destroy(); } catch(_){} dateChartInstance = null; }
  if (window._donutChart){ try { window._donutChart.destroy();} catch(_){} window._donutChart= null; }
}

async function loadAnalytics(forceRefresh) {
  if (analyticsLoaded && !forceRefresh) return;

  const loading = document.getElementById('analytics-loading');
  const statsEl = document.getElementById('analytics-stats');
  const chartsEl = document.getElementById('analytics-charts');

  // Show loading, hide stale content
  if (loading) { loading.style.display = 'block'; loading.textContent = '↻ Loading analytics…'; }
  if (statsEl)  statsEl.style.display = 'none';
  if (chartsEl) chartsEl.style.display = 'none';

  // Destroy charts BEFORE wiping innerHTML (prevents Chart.js canvas orphans)
  destroyAnalyticsCharts();

  try {
    /* ── 1. Fetch fresh data from backend ─────────────────────── */
    let articles = [];
    try {
      const res = await fetchWithTimeout(getApiUrl('/api/articles'));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();
      articles = Array.isArray(raw) ? raw : (raw.articles || []);
    } catch (fetchErr) {
      // Fallback: use already-loaded allArticles from feed
      articles = allArticles || [];
      console.warn('Analytics fetch failed, using cached feed:', fetchErr.message);
    }

    if (!articles.length) {
      if (loading) loading.textContent = 'No articles found. Make sure the backend is running and articles are loaded.';
      return;
    }

    /* ── 2. Build stats with correct category detection ────────── */
    const catCounts  = {};
    const srcCounts  = {};
    const dateCounts = {};

    articles.forEach(a => {
      // Fix BUG 2: detect category client-side since raw API may not have it
      const cat = detectArticleCategory(a);
      catCounts[cat] = (catCounts[cat] || 0) + 1;

      // Fix BUG 5: unwrap source objects properly
      let src = a.source;
      if (typeof src === 'object' && src !== null) src = src.name || src.id || 'Unknown';
      src = (src || 'Unknown').trim();
      if (!src) src = 'Unknown';
      srcCounts[src] = (srcCounts[src] || 0) + 1;

      // Date grouping
      const rawDate = a.published_at || a.publishedAt || a.createdAt;
      if (rawDate) {
        try {
          const d = new Date(rawDate);
          if (!isNaN(d)) {
            const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            dateCounts[label] = (dateCounts[label] || 0) + 1;
          }
        } catch(_) {}
      }
    });

    const catEntries  = Object.entries(catCounts).sort((a,b) => b[1]-a[1]);
    const srcEntries  = Object.entries(srcCounts).sort((a,b) => b[1]-a[1]).slice(0, 10);
    // Sort date entries chronologically
    const dateEntries = Object.entries(dateCounts)
      .sort((a, b) => new Date(a[0] + ' 2025') - new Date(b[0] + ' 2025'))
      .slice(0, 14);

    const topCat    = catEntries[0]?.[0] || '—';
    const topSrc    = srcEntries[0]?.[0] || '—';
    const avgPerDay = dateEntries.length ? Math.round(articles.length / dateEntries.length) : 0;

    /* ── 3. Stat cards — correct CSS classes from style.css ────── */
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-card">
          <div class="stat-label">Total Articles</div>
          <div class="stat-value" style="font-size:28px;font-weight:700;color:var(--text);margin-top:6px;">${articles.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Categories</div>
          <div class="stat-value" style="font-size:28px;font-weight:700;color:var(--text);margin-top:6px;">${catEntries.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Top Category</div>
          <div class="stat-value" style="font-size:15px;font-weight:700;color:${ANALYTICS_CAT_COLORS[topCat]||'var(--accent)'};margin-top:6px;line-height:1.3;">${topCat}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Top Source</div>
          <div class="stat-value" style="font-size:13px;font-weight:700;color:var(--text);margin-top:6px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${topSrc}</div>
        </div>
      `;
      statsEl.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;';
    }

    /* ── 4. Build charts HTML (canvas IDs must be unique & fresh) ── */
    if (chartsEl) {
      chartsEl.innerHTML = `
        <div class="charts-row">
          <!-- Articles by Category — horizontal bar, tall enough to show all labels -->
          <div class="chart-card">
            <h4>Articles by Category</h4>
            <p style="color:var(--text3);font-size:12px;margin-bottom:12px;">Distribution across technology topics</p>
            <div class="chart-area" style="height:${Math.max(240, catEntries.length * 34)}px;position:relative;">
              <canvas id="ac-cat-chart"></canvas>
            </div>
          </div>

          <!-- Top Sources — donut -->
          <div class="chart-card">
            <h4>Top Sources</h4>
            <p style="color:var(--text3);font-size:12px;margin-bottom:12px;">News outlets by article volume</p>
            <div class="donut-wrap" style="margin-top:4px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
              <canvas id="ac-donut-chart" width="150" height="150" style="flex-shrink:0;"></canvas>
              <div class="donut-legend" id="ac-donut-legend" style="flex:1;min-width:120px;"></div>
            </div>
          </div>
        </div>

        <!-- Source breakdown — horizontal bar -->
        <div class="influencers-card">
          <h4>Source Breakdown</h4>
          <p style="color:var(--text3);font-size:12px;margin-bottom:12px;">Article count per publication</p>
          <div class="chart-area" style="height:${Math.max(180, srcEntries.length * 32)}px;position:relative;">
            <canvas id="ac-src-chart"></canvas>
          </div>
        </div>

        <!-- Articles by Date — line chart -->
        ${dateEntries.length > 1 ? `
        <div class="influencers-card">
          <h4>📅 Publication Timeline</h4>
          <p style="color:var(--text3);font-size:12px;margin-bottom:12px;">Articles published per day</p>
          <div class="chart-area" style="height:180px;position:relative;">
            <canvas id="ac-date-chart"></canvas>
          </div>
        </div>` : ''}

        <!-- Trend bars -->
        <div class="influencers-card">
          <h4>📈 Category Trends</h4>
          <p style="color:var(--text3);font-size:12px;margin-bottom:12px;">Coverage intensity by topic</p>
          <div id="ac-trend-cats" style="margin-top:12px;"></div>
        </div>

        <!-- Bottom summary cards -->
        <div class="bottom-cards">
          <div class="bottom-card">
            <div class="bottom-card-icon">📊</div>
            <h4>Feed Summary</h4>
            <p>You have <span class="highlight">${articles.length} articles</span> across <span class="highlight">${catEntries.length} categories</span>. The most covered topic is <span class="highlight">${topCat}</span> with <span class="highlight">${catCounts[topCat] || 0} articles</span>.</p>
            <a style="cursor:pointer;" onclick="loadAnalytics(true)">↻ Refresh data</a>
          </div>
          <div class="bottom-card">
            <div class="bottom-card-icon">🏆</div>
            <h4>Top Publisher</h4>
            <p><span class="highlight2">${topSrc}</span> leads with <span class="highlight2">${srcEntries[0]?.[1] || 0} articles</span>. Average <span class="highlight2">${avgPerDay} articles/day</span> across ${dateEntries.length} tracked days.</p>
            <a style="cursor:pointer;" onclick="showScreen('dashboard')">View feed →</a>
          </div>
        </div>
      `;
    }

    /* ── 5. Render Category horizontal bar chart ─────────────────── */
    const catCtx = document.getElementById('ac-cat-chart')?.getContext('2d');
    if (catCtx) {
      catChartInstance = new Chart(catCtx, {
        type: 'bar',
        data: {
          labels: catEntries.map(e => e[0]),
          datasets: [{
            label: 'Articles',
            data: catEntries.map(e => e[1]),
            backgroundColor: catEntries.map(e => (ANALYTICS_CAT_COLORS[e[0]] || '#378add') + 'cc'),
            borderColor:     catEntries.map(e => ANALYTICS_CAT_COLORS[e[0]] || '#378add'),
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.parsed.x} article${ctx.parsed.x !== 1 ? 's' : ''}`
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { stepSize: 1, color: 'rgba(255,255,255,0.5)', font: { size: 11 } },
              grid: { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
              ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 12 } },
              grid: { display: false }
            }
          }
        }
      });
    }

    /* ── 6. Donut chart (top sources) ────────────────────────────── */
    const donutCtx = document.getElementById('ac-donut-chart')?.getContext('2d');
    if (donutCtx) {
      window._donutChart = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: srcEntries.map(e => e[0]),
          datasets: [{
            data: srcEntries.map(e => e[1]),
            backgroundColor: DONUT_COLORS,
            borderWidth: 2,
            borderColor: 'var(--surface)'
          }]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } }
          }
        }
      });

      const legendEl = document.getElementById('ac-donut-legend');
      if (legendEl) {
        legendEl.innerHTML = srcEntries.map((e, i) => `
          <div class="legend-item" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <div class="legend-dot" style="width:9px;height:9px;border-radius:2px;flex-shrink:0;background:${DONUT_COLORS[i]||'#888'};"></div>
            <span class="legend-name" style="font-size:11px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e[0]}</span>
            <span class="legend-pct" style="font-size:11px;color:var(--text3);font-weight:600;">${e[1]}</span>
          </div>`).join('');
      }
    }

    /* ── 7. Source bar chart ─────────────────────────────────────── */
    const srcCtx = document.getElementById('ac-src-chart')?.getContext('2d');
    if (srcCtx) {
      srcChartInstance = new Chart(srcCtx, {
        type: 'bar',
        data: {
          labels: srcEntries.map(e => e[0]),
          datasets: [{
            label: 'Articles',
            data: srcEntries.map(e => e[1]),
            backgroundColor: '#378add88',
            borderColor: '#378add',
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} articles` } }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { stepSize: 1, color: 'rgba(255,255,255,0.5)', font: { size: 11 } },
              grid: { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
              ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
              grid: { display: false }
            }
          }
        }
      });
    }

    /* ── 8. Date / timeline line chart ───────────────────────────── */
    if (dateEntries.length > 1) {
      const dateCtx = document.getElementById('ac-date-chart')?.getContext('2d');
      if (dateCtx) {
        dateChartInstance = new Chart(dateCtx, {
          type: 'line',
          data: {
            labels: dateEntries.map(e => e[0]),
            datasets: [{
              label: 'Articles',
              data: dateEntries.map(e => e[1]),
              borderColor: '#7f77dd',
              backgroundColor: 'rgba(127,119,221,0.15)',
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: '#7f77dd',
              fill: true,
              tension: 0.35,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
              y: { beginAtZero: true, ticks: { stepSize: 1, color: 'rgba(255,255,255,0.5)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
          }
        });
      }
    }

    /* ── 9. Category trend bars ──────────────────────────────────── */
    const trendCatEl = document.getElementById('ac-trend-cats');
    if (trendCatEl && catEntries.length) {
      const maxCat = catEntries[0][1];
      trendCatEl.innerHTML = catEntries.map(([name, count]) => `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <span style="font-size:12px;color:var(--text2);width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">${name}</span>
          <div style="flex:1;background:var(--surface3);border-radius:4px;height:16px;overflow:hidden;">
            <div style="height:100%;border-radius:4px;background:${ANALYTICS_CAT_COLORS[name]||'#378add'};width:${Math.round((count/maxCat)*100)}%;transition:width .6s ease;"></div>
          </div>
          <span style="font-size:12px;color:var(--text3);width:28px;text-align:right;flex-shrink:0;">${count}</span>
        </div>`).join('');
    }

    /* ── 10. Show everything, mark loaded ────────────────────────── */
    if (loading) loading.style.display = 'none';
    if (statsEl) statsEl.style.display = 'grid';
    if (chartsEl) chartsEl.style.display = 'block';
    analyticsLoaded = true;

  } catch(err) {
    console.error('Analytics error:', err);
    if (loading) {
      loading.style.display = 'block';
      loading.innerHTML = `<span style="color:var(--red);">⚠️ Analytics failed: ${err.message}</span><br><button onclick="loadAnalytics(true)" style="margin-top:10px;padding:6px 16px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Retry</button>`;
    }
  }
}

// Hook into showScreen — trigger page-specific loaders
const _origShowScreen = showScreen;
showScreen = function(id) {
  _origShowScreen(id);
  if (id === 'analytics') loadAnalytics(false);  // false = use cache if available
  if (id === 'bookmarks') renderBookmarks();
  if (id === 'settings')  { loadResearchHistory(); loadUserProfile(); }
};
  /* Auto-refresh every 5 min */
  setInterval(() => {
    if (sessionStorage.getItem("loggedIn") === "true") {
      loadArticles().then(() => refreshPrometheusPrompts()).catch(() => {});
    }
  }, 300_000);
});