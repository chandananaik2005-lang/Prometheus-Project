require("dns").setDefaultResultOrder("ipv4first");
require("dotenv").config();

const express         = require("express");
const cors            = require("cors");
const path            = require("path");
const cron            = require("node-cron");
const axios           = require("axios");
const { MongoClient } = require("mongodb");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});
console.log("GROQ KEY:", process.env.GROQ_API_KEY);
/* ═══════════════════════════════════════════════════════════════════
   APP BOOTSTRAP
═══════════════════════════════════════════════════════════════════ */
const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json({ limit: "10mb" }));
// Vanilla assets (style.css, app.js) live in public/public/static/
app.use("/static", express.static(path.join(__dirname, "public", "public", "static")));
// React production build lives in public/build/ — dev uses localhost:3000
app.use('/api', require('./routes/news'));
app.get("/", (req, res) => {
  console.log("SERVING CLASSIC HTML");
  res.sendFile(
    path.join(__dirname, "public", "public", "classic.html")
  );
});
/* ═══════════════════════════════════════════════════════════════════
   ENV CHECK
═══════════════════════════════════════════════════════════════════ */
const MISSING = [];
if (!process.env.MONGO_URI)    MISSING.push("MONGO_URI");
if (!process.env.NEWS_API_KEY) MISSING.push("NEWS_API_KEY");
if (MISSING.length) console.warn("⚠️  Missing env vars:", MISSING.join(", "));

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════ */
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop";

const TOPICS = [
  "artificial intelligence",
  "machine learning",
  "technology news",
  "robotics",
  "cybersecurity",
  "space exploration",
  "openai chatgpt",
  "nvidia gpu",
  "apple iphone",
  "quantum computing",
  "semiconductor chips",
  "electric vehicles",
  "cloud computing"
];

/* ═══════════════════════════════════════════════════════════════════
   MONGODB
═══════════════════════════════════════════════════════════════════ */
let db          = null;
let mongoClient = null;

async function connectMongo() {
  if (!process.env.MONGO_URI) {
    console.warn("⚠️  MONGO_URI missing — running without database");
    return;
  }
  try {
    mongoClient = new MongoClient(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS:         8000,
      socketTimeoutMS:          8000,
      family:                   4
    });
    await mongoClient.connect();
    db = mongoClient.db("newsDB");

    const col = db.collection("articles");
    try { await col.createIndex({ published_at: -1 }); }                      catch (_) {}
    try { await col.createIndex({ title: 1 }); }                              catch (_) {}
    try { await col.createIndex({ title: "text", description: "text" }); }   catch (_) {}

    const oc = db.collection("opened_articles");
    try { await oc.createIndex({ openedAt: -1 }); }                           catch (_) {}
    try { await oc.createIndex({ title: 1 }); }                               catch (_) {}

    console.log("✅ MongoDB connected");
  } catch (err) {
    console.warn("❌ MongoDB init failed:", err.message, "— server will run without database");
    db = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   UNFLUFF (article scraper)
═══════════════════════════════════════════════════════════════════ */
let unfluff = null;
(async () => {
  try {
    const mod = await import("unfluff");
    unfluff   = mod.default || mod;
    console.log("✅ unfluff loaded");
  } catch {
    console.warn("⚠️  unfluff unavailable — scraping disabled");
  }
})();

/* ═══════════════════════════════════════════════════════════════════
   IN-MEMORY CACHE
═══════════════════════════════════════════════════════════════════ */
let CACHE            = [];
let LAST_UPDATE      = 0;
let isFetching       = false;
let newsApiDisabled  = false;   // set true on 401/403 to stop retry spam

/* Multi-article memory — keeps the last 50 user-opened articles */
let OPENED_ARTICLES  = [];
const MAX_OPENED     = 50;

/* ═══════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
═══════════════════════════════════════════════════════════════════ */
function shuffle(arr) {
  if (!Array.isArray(arr)) return [];
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeTitle(text) {
  if (!text) return "";
  return text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function isEnglish(text) {
  if (!text || text.length < 5) return false;
  return (text.match(/[a-zA-Z]/g) || []).length / text.length > 0.45;
}

function stripHtml(str) {
  return (str || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text) {
  return (stripHtml(text).match(/\b\w+\b/g) || []).length;
}

/* ═══════════════════════════════════════════════════════════════════
   IMAGE VALIDATION
═══════════════════════════════════════════════════════════════════ */
function getSafeImage(...candidates) {
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
      low.includes("picsum.photos")  ||
      low.includes("placeholder")    ||
      low.includes("broken")         ||
      low.includes("example.com")    ||
      low.includes("mock")           ||
      img.length < 14
    ) continue;
    return img;
  }
  return FALLBACK_IMAGE;
}

/* ═══════════════════════════════════════════════════════════════════
   DEDUPLICATION HELPERS
═══════════════════════════════════════════════════════════════════ */
function getWords(text) {
  if (!text || typeof text !== "string") return new Set();
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 1)
  );
}

function jaccardSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const e of setA) if (setB.has(e)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

function normalizeUrl(url) {
  if (!url || typeof url !== "string") return "";
  try {
    let u = url.toLowerCase().trim()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("?")[0].split("#")[0];
    if (u.endsWith("/")) u = u.slice(0, -1);
    return u;
  } catch { return url; }
}

function isSentenceDuplicate(sentence, seenSet) {
  const words = getWords(sentence);
  if (!words.size) return true;
  for (const seen of seenSet) {
    if (jaccardSimilarity(words, getWords(seen)) > 0.42) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   QUALITY SCORE
═══════════════════════════════════════════════════════════════════ */
function getQualityScore(article) {
  let score = 0;
  const wc  = wordCount(article.content || "");
  score += Math.min(wc * 1.5, 2400);
  if ((article.content || "").includes('class="article-paragraph"')) score += 500;
  const img = article.image_url || article.urlToImage || "";
  if (img && img.startsWith("http") && !img.includes("photo-1518770660439")) score += 800;
  const pub = new Date(article.published_at || article.publishedAt || article.createdAt || 0);
  if (!isNaN(pub.getTime())) {
    score += Math.floor((pub.getTime() - new Date("2025-01-01").getTime()) / 3_600_000) * 0.1;
  }
  return score;
}

/* ═══════════════════════════════════════════════════════════════════
   BOILERPLATE PHRASES TO STRIP
═══════════════════════════════════════════════════════════════════ */
const BOILERPLATE = [
  "represents one of the most significant recent developments",
  "this story has captured attention from researchers",
  "to fully understand its implications",
  "over the past decade, the pace of technological innovation",
  "what once took years to develop now emerges in months",
  "this democratization of technology has fueled",
  "the technology sector continues to reshape",
  "advances in semiconductor manufacturing",
  "tsmc, samsung, and intel are locked",
  "cloud computing has become the backbone",
  "amazon web services, microsoft azure, and google cloud",
  "the shift to cloud-native architectures",
  "against this backdrop, the news surrounding",
  "industry analysts note that such developments",
  "understanding the forces that led to this moment",
  "capital allocation patterns reflect",
  "the engineers, scientists, and product leaders",
  "top researchers command compensation",
  "geographic clusters of talent",
  "regulators and policymakers face a challenging",
  "crafting governance frameworks that protect",
  "these divergent regulatory philosophies",
  "civil society organizations, academic researchers",
  "questions about algorithmic bias",
  "responsible development requires engaging",
  "technical deep dive",
  "from a technical standpoint",
  "traditional approaches to system design",
  "what once required a data center",
  "interoperability and standardization",
  "the tension between these forces",
  "the economic implications",
  "investment flows, employment effects",
  "from a macroeconomic perspective",
  "however, distributional concerns are real",
  "the gains from technological progress",
  "designing policies that broaden",
  "global trade and geopolitical dynamics",
  "semiconductor supply chains, software",
  "the fragmentation of the global",
  "future outlook",
  "looking ahead, the trajectory",
  "expert forecasts differ on precise",
  "autonomous systems, personalized medicine",
  "the organizations and individuals best positioned",
  "adaptability — at the level",
  "collaboration across sectors",
  "the most complex challenges of our time",
  "building the trust, governance",
  "is ultimately a story about the relentless forward motion",
  "the technology industry bears significant responsibility",
  "meeting that responsibility demands",
  "undergoing a maturity phase",
  "this represents a watershed moment",
  "few developments in recent memory",
  "the implications of this cannot be overstated"
];

const SECTION_HEADING_RE =
  /^(section\s*\d+|overview|background(\s+and\s+context)?|key\s+developments|technical\s+deep\s+dive|economic\s+dimensions|future\s+outlook|conclusion|introduction|summary|context|analysis|impact|implications)[\s:.\-–—]*$/i;

/* ═══════════════════════════════════════════════════════════════════
   LONG-FORM ARTICLE GENERATOR
   Produces 1500+ word, 3–4 paragraph premium editorial content
═══════════════════════════════════════════════════════════════════ */
function buildLongFormArticle(title, description, source, rawText) {
  const cleanTitle = (title || "").trim();
  const cleanDesc  = (description || "").trim();
  const cleanSrc   = (source  || "a leading technology outlet").trim();

  /* ── 1. Extract real sentences from scraped text ─────────────── */
  const realSentences = [];
  const realSeen      = new Set();

  if (rawText && rawText.length > 100) {
    const stripped = rawText
      .replace(/<[^>]*>/g, " ")
      .replace(/#{1,6}\s+[^\n]*/g, " ")
      .replace(/\*\*[^*]+\*\*/g, m => m.replace(/\*\*/g, ""))
      .replace(/\s+/g, " ")
      .trim();

    for (let s of stripped.split(/(?<=[.!?])\s+/)) {
      s = s.trim();
      if (s.length < 40) continue;
      if (SECTION_HEADING_RE.test(s)) continue;
      const low = s.toLowerCase();
      if (BOILERPLATE.some(p => low.includes(p))) continue;
      if (isSentenceDuplicate(s, realSeen)) continue;
      realSeen.add(s);
      realSentences.push(s);
    }
  }

  /* ── 2. Extract keywords from title + description ────────────── */
  const STOP = new Set([
    "a","an","the","and","or","but","if","then","how","why","who","where","when",
    "does","do","did","can","could","would","should","will","of","to","in","for",
    "on","with","at","by","from","about","as","into","like","after","before",
    "this","that","it","its","be","been","was","were","are","have","has","had",
    "not","no","so","up","out","more","also","than","their","they","them",
    "he","she","we","you","i","my","his","her","our","your","its","said","says",
    "report","reports","according","per","amid","via","vs","over","under","through"
  ]);

  function extractKeywords(text, n = 8) {
    const freq = {};
    (text || "").toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
      .forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(e => e[0]);
  }

  const keywords = extractKeywords(cleanTitle + " " + cleanDesc + " " + rawText, 10);

  /* ── 3. Paragraph expansion vocabulary ──────────────────────── */
  const industryContexts = [
    `The broader technology industry has been closely watching developments like this, particularly as competition intensifies across global markets. Companies and research institutions are accelerating their timelines, redirecting capital toward exactly the kind of infrastructure that stories such as this one illuminate. What makes this moment notable is not simply the announcement itself, but what it signals about the underlying pace of change that practitioners across the sector have been quietly tracking for the better part of two years.`,

    `Across the ecosystem, organizations operating at the frontier of this field have been recalibrating their strategies with growing urgency. The competitive pressures that drive innovation cycles are compressing — what would previously have unfolded over several quarters is now happening in weeks. Enterprise buyers, research sponsors, and technical teams are all adjusting their planning horizons accordingly, taking developments like this as reference points for what the baseline of capability looks like today versus what it could represent eighteen months from now.`,

    `The engineering and product communities that follow this domain have noted a pattern that this story reinforces: announcements that once would have been remarkable milestones are now landing as expected iterations in a fast-compressing cadence. The implication is not that individual developments matter less, but rather that the aggregate velocity of progress demands a different kind of analytical attention — one focused less on single data points and more on the directional arc they collectively describe.`
  ];

  const marketContexts = [
    `From a market perspective, the implications of this development reach well beyond the immediate participants. Downstream vendors, platform integrators, and enterprise adopters all find themselves reassessing their roadmaps in light of what the current landscape actually permits versus what it constrained even a short time ago. Supply chain dynamics, partnership structures, and go-to-market timelines are each, in their own way, sensitive to exactly the kind of shift that announcements in this category represent.`,

    `Investors and analysts tracking this space have identified the trend this story sits within as one of the more consequential investment themes of the current period. The capital formation dynamics — where and how money moves in response to technical credibility signals — are themselves a leading indicator of where incumbents and challengers believe the durable value will ultimately concentrate. Stories like this one help explain why allocation patterns continue to tilt in the directions they do, even against a backdrop of broader macroeconomic uncertainty.`,

    `For organizations that have been building positions in this market, the development represents both a validation of prior decisions and a prompt to revisit assumptions that were reasonable twelve months ago but may now require revision. Competitive moats that seemed durable are being re-evaluated, and the companies best equipped to respond are those that built flexibility into their technical architectures rather than optimizing narrowly for conditions that no longer fully apply.`
  ];

  const technicalContexts = [
    `The technical dimensions of this story reward closer examination. At its core, what is being described reflects a shift not just in capability magnitude but in the underlying approach that makes those capabilities achievable. Engineers who have worked in adjacent areas will recognize the conceptual lineage, even as the specific implementation represents something genuinely new. The design choices embedded in systems like this reflect lessons absorbed from earlier generations of work, applied under constraints — computational, economic, regulatory — that have themselves changed in meaningful ways.`,

    `From a systems design perspective, the challenges this area presents are non-trivial. Reliability at scale, latency under variable load conditions, interpretability of outputs, and robustness against distributional shift are each active research problems that practitioners grapple with daily. Progress against these problems is rarely linear, and the field has learned to temper its enthusiasm for point-in-time results with appropriate acknowledgment of the gap between benchmark performance and real-world deployment.`,

    `Hardware, software, and data infrastructure are advancing in ways that compound on each other, creating capability curves that are difficult to model from first principles alone. The efficiencies being unlocked at the model layer are being matched by improvements in the silicon and memory systems underneath, and by more sophisticated approaches to data curation and training methodology above. Understanding any single development in this space requires holding all three of these dimensions in view simultaneously.`
  ];

  const futureContexts = [
    `Looking at where this trajectory leads, the picture that emerges is one of continued compression of the distance between research prototype and production deployment. Organizations that have previously relied on that distance as a buffer — to observe, to plan, to de-risk — are finding the window shortening. The strategic premium on genuine technical literacy within leadership teams has never been higher, because the decisions being made today about architecture, vendor relationships, and talent investment will have consequences that compound over a window that is shorter than most planning cycles assume.`,

    `The communities most directly affected by developments in this area are, in many respects, already living in the future that the rest of the market is only beginning to anticipate. Their experience — the constraints they have encountered, the workarounds they have developed, the use cases that have surprised even their own teams — provides the most reliable signal of what broader adoption will look like and where the remaining friction points sit.`,

    `Regulatory and policy conversations are also evolving in response to developments like this, though typically on a lag that reflects both the complexity of the technical subject matter and the institutional processes through which governance frameworks are built. The frameworks that ultimately emerge will shape the commercial landscape in ways that are not yet fully legible, but the direction of travel — toward greater accountability, more explicit documentation of system behavior, and clearer lines of responsibility for outcomes — seems reasonably consistent across jurisdictions.`
  ];

  /* ── 4. Sentence pool from real content ─────────────────────── */
  const pool = [...realSentences];

  const titleSentence = cleanTitle.endsWith(".") ? cleanTitle : cleanTitle + ".";
  const descSentences = cleanDesc
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  function pickExpansion(arr) { return randomItem(arr); }

  const third = Math.ceil(pool.length / 3);
  const s1    = pool.slice(0, third);
  const s2    = pool.slice(third, third * 2);
  const s3    = pool.slice(third * 2);

  /* Para 1 */
  const p1Parts = [];
  if (titleSentence) p1Parts.push(titleSentence);
  descSentences.slice(0, 2).forEach(s => { if (!isSentenceDuplicate(s, new Set(p1Parts))) p1Parts.push(s); });
  s1.slice(0, 6).forEach(s => { if (!isSentenceDuplicate(s, new Set(p1Parts))) p1Parts.push(s); });
  if (p1Parts.length < 4) p1Parts.push(pickExpansion(industryContexts).split(/(?<=[.!?])\s+/)[0]);
  const para1 = p1Parts.join(" ").trim();

  /* Para 2 */
  const p2Parts = [];
  descSentences.slice(2, 4).forEach(s => { if (!isSentenceDuplicate(s, new Set([...p1Parts]))) p2Parts.push(s); });
  s2.slice(0, 6).forEach(s => { if (!isSentenceDuplicate(s, new Set([...p1Parts, ...p2Parts]))) p2Parts.push(s); });
  p2Parts.push(pickExpansion(marketContexts));
  const para2 = p2Parts.join(" ").trim();

  /* Para 3 */
  const p3Parts = [];
  s3.slice(0, 6).forEach(s => { if (!isSentenceDuplicate(s, new Set([...p1Parts, ...p2Parts]))) p3Parts.push(s); });
  p3Parts.push(pickExpansion(technicalContexts));
  const para3 = p3Parts.join(" ").trim();

  /* Para 4 */
  let para4 = "";
  if (realSentences.length > 8 || cleanDesc.length > 200) {
    const p4Parts = [];
    const spillSentences = [
      ...s1.slice(6), ...s2.slice(6), ...s3.slice(6)
    ].filter(s => !isSentenceDuplicate(s, new Set([...p1Parts, ...p2Parts, ...p3Parts])));
    spillSentences.slice(0, 3).forEach(s => p4Parts.push(s));
    p4Parts.push(pickExpansion(futureContexts));
    if (p4Parts.length >= 2) para4 = p4Parts.join(" ").trim();
  }

  let html = `<p class="article-paragraph">${para1}</p>\n`;
  if (para2) html += `<p class="article-paragraph">${para2}</p>\n`;
  if (para3) html += `<p class="article-paragraph">${para3}</p>\n`;
  if (para4) html += `<p class="article-paragraph">${para4}</p>\n`;

  return html.trim();
}

/* ═══════════════════════════════════════════════════════════════════
   CLEAN EXISTING ARTICLES
═══════════════════════════════════════════════════════════════════ */
function cleanAndSummarizeLocal(title, description, content, source) {
  const wc = wordCount(content || "");
  if (wc > 400 && content && content.includes('class="article-paragraph"')) {
    const cleaned = content
      .replace(/<p[^>]*>\s*(Section\s*\d+|Overview|Background[^<]{0,60}|Key Developments|Technical Deep Dive|Economic Dimensions|Future Outlook|Conclusion|Introduction|Summary)\s*<\/p>/gi, "")
      .replace(/<h[1-6][^>]*>[^<]*<\/h[1-6]>/gi, "");
    if (wordCount(cleaned) > 300) return cleaned;
  }
  return buildLongFormArticle(title, description, source, content || "");
}

/* ═══════════════════════════════════════════════════════════════════
   NORMALIZE ARTICLE
═══════════════════════════════════════════════════════════════════ */
function normalizeArticle(article) {
  if (!article) return null;

  let published_at = article.published_at || article.publishedAt || article.createdAt;
  if (!published_at) {
    published_at = new Date().toISOString();
  } else if (published_at instanceof Date) {
    published_at = published_at.toISOString();
  } else {
    const d = new Date(published_at);
    published_at = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  const image_url = getSafeImage(article.image_url, article.urlToImage, article.image);

  const source =
    article.source && typeof article.source === "object"
      ? (article.source.name || "NewsAPI")
      : (article.source || "Prometheus");

  const rawContent = article.content || article.description || "";
  const content    = cleanAndSummarizeLocal(
    article.title       || "Untitled",
    article.description || "",
    rawContent,
    source
  );

  return {
    title:       article.title || "Untitled Article",
    description: article.description || "",
    content,
    source,
    image_url,
    article_url: article.article_url || article.url || "",
    category:    article.category    || "technology",
    published_at
  };
}

/* ═══════════════════════════════════════════════════════════════════
   LOCAL QA ENGINE — fully offline, zero external API calls

   Supports:
   • Single-article Q&A (article passed in request body)
   • Multi-article memory search (all previously opened articles)
   • Cross-article comparison / synthesis
   • Follow-up context handling
   • Contextual fallback — NEVER returns empty
═══════════════════════════════════════════════════════════════════ */
const QA_STOPWORDS = new Set([
  "a","an","the","and","or","but","if","then","how","why","who","where","when",
  "does","do","did","can","could","would","should","will","shall","of","to","in",
  "for","on","with","at","by","from","about","as","into","like","through","after",
  "before","between","under","over","please","tell","me","article","this","that",
  "these","those","it","its","be","been","was","were","are","have","has","had",
  "not","no","so","up","out","more","also","than","their","they","them","he",
  "she","we","you","i","my","his","her","our","your","what","is","give","explain",
  "describe","summarize","summary","discuss","say","says","said","think","know",
  "across","all","articles","opened","read","remember","recalled","previous"
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !QA_STOPWORDS.has(w));
}

function extractNgrams(tokens, maxN = 2) {
  const ngrams = new Set(tokens);
  for (let n = 2; n <= maxN; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.add(tokens.slice(i, i + n).join("_"));
    }
  }
  return ngrams;
}

function scoreSentence(sentence, qTokens, qNgrams) {
  const sTokens = tokenize(sentence);
  const sNgrams = extractNgrams(sTokens, 2);
  if (!sTokens.length || !qTokens.length) return 0;

  let unigramHits = 0;
  let ngramHits   = 0;

  for (const t of qTokens)  if (sTokens.includes(t))  unigramHits++;
  for (const ng of qNgrams) if (sNgrams.has(ng))       ngramHits++;

  const unigramScore  = unigramHits / qTokens.length;
  const ngramBonus    = ngramHits   / Math.max(1, qNgrams.size) * 0.5;
  const lengthPenalty = sTokens.length < 6 ? 0.3 : 1;

  return (unigramScore + ngramBonus) * lengthPenalty;
}

/* ── Detect cross-article / multi-article intent ────────────────── */
function isMultiArticleQuery(question) {
  const q = question.toLowerCase();
  return (
    q.includes("all article") || q.includes("every article") ||
    q.includes("across article") || q.includes("multiple article") ||
    q.includes("compare") || q.includes("between") ||
    q.includes("both") || q.includes("all topic") ||
    q.includes("what have") || q.includes("what did") ||
    q.includes("everything") || q.includes("overall") ||
    q.includes("summary of all") || q.includes("what do you know")
  );
}

/* ── Build corpus from a single article object ───────────────────── */
function buildCorpus(article, baseWeight = 1) {
  const corpus     = [];
  const corpusSeen = new Set();
  const title       = (article.title       || "").trim();
  const description = (article.description || "").trim();
  const content     = stripHtml(article.content || "");

  const addSentences = (text, weight) => {
    text.split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 20)
      .forEach(s => {
        const key = s.toLowerCase().slice(0, 80);
        if (corpusSeen.has(key)) return;
        corpusSeen.add(key);
        corpus.push({ s, weight, source: title });
      });
  };

  if (title)       addSentences(title, 3 * baseWeight);
  if (description) addSentences(description, 2 * baseWeight);
  if (content)     addSentences(content, 1 * baseWeight);

  return corpus;
}

/* ── Format answer from top-scored hits ─────────────────────────── */
function composeAnswer(question, scored, title, description, isMulti) {
  const THRESHOLD = 0.12;
  const topHits   = scored
    .filter(x => x.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  topHits.sort((a, b) => a.i - b.i);

  const answerSentences = [];
  const hitSeen         = new Set();
  for (const { s } of topHits) {
    if (!isSentenceDuplicate(s, hitSeen)) {
      hitSeen.add(s);
      answerSentences.push(s);
    }
  }

  if (answerSentences.length >= 2) {
    const body = answerSentences.join(" ");

    const qLow = question.toLowerCase();
    let intro   = "";
    if (qLow.includes("what") || qLow.includes("explain") || qLow.includes("describe")) {
      intro = isMulti ? "Across the articles you've read, " : "Based on the article, ";
    } else if (qLow.includes("why")) {
      intro = "The article addresses this by noting that ";
    } else if (qLow.includes("how")) {
      intro = isMulti ? "Based on the articles you've read, " : "According to the article, ";
    } else if (qLow.includes("who")) {
      intro = "The article identifies that ";
    } else if (qLow.includes("when")) {
      intro = "On the timing, the article indicates that ";
    } else if (qLow.includes("compare") || qLow.includes("between")) {
      intro = "Comparing across the articles you've read: ";
    } else if (qLow.includes("impact") || qLow.includes("effect") || qLow.includes("implication")) {
      intro = "Regarding impact, the article notes that ";
    }

    /* Supporting detail */
    const supportHits = scored
      .filter(x => x.score > 0.05 && !topHits.includes(x))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    let supportText = "";
    if (supportHits.length) {
      const supportSentence = supportHits[0].s;
      if (!isSentenceDuplicate(supportSentence, hitSeen)) {
        supportText = `\n\nAdditionally, ${supportSentence.charAt(0).toLowerCase() + supportSentence.slice(1)}`;
      }
    }

    return `${intro}${body}${supportText}`;
  }

  if (answerSentences.length === 1) {
    return `${answerSentences[0]}\n\nFor fuller context, this article covers ${title} — ${description}`;
  }

  return null; // signal caller to use fallback
}

/* ── Primary QA function (single or multi-article) ──────────────── */
function localArticleQA(question, article) {
  const qTokens = tokenize(question);
  const qNgrams = extractNgrams(qTokens, 2);

  const title       = (article.title       || "").trim();
  const description = (article.description || "").trim();

  if (!qTokens.length) {
    if (title) return `This article covers **"${title}"**.\n\n${description}`;
    return "Please ask a specific question about the article.";
  }

  const multi = isMultiArticleQuery(question);

  /* ── Multi-article cross-search ─────────────────────────────── */
  if (multi && OPENED_ARTICLES.length > 0) {
    const allCorpus = [];
    const articlesToSearch = article && title
      ? [article, ...OPENED_ARTICLES.filter(a => a.title !== title)]
      : [...OPENED_ARTICLES];

    articlesToSearch.forEach((art, idx) => {
      const weight = idx === 0 ? 1.2 : 1.0; // slight boost for current article
      buildCorpus(art, weight).forEach(entry => allCorpus.push(entry));
    });

    const scored = allCorpus.map((entry, i) => ({
      s:      entry.s,
      score:  scoreSentence(entry.s, qTokens, qNgrams) * entry.weight,
      i,
      source: entry.source
    }));

    const answer = composeAnswer(question, scored, title, description, true);
    if (answer) {
      const sourceList = [...new Set(articlesToSearch.map(a => a.title).filter(Boolean))];
      const sourceNote = sourceList.length > 1
        ? `\n\n*Synthesized from ${sourceList.length} articles in your reading history.*`
        : "";
      return answer + sourceNote;
    }

    /* Cross-article fallback: list topics covered */
    const topics = articlesToSearch.map(a => `• **${a.title}**`).join("\n");
    return `Based on your reading history, here are the articles I can draw from:\n\n${topics}\n\nTry asking a more specific question about any of these topics.`;
  }

  /* ── Single-article search ───────────────────────────────────── */
  const corpus = buildCorpus(article);

  if (!corpus.length) {
    return `The article **"${title}"** does not contain enough content to answer questions directly.\n\n**Summary:** ${description}`;
  }

  const scored = corpus.map((entry, i) => ({
    s:      entry.s,
    score:  scoreSentence(entry.s, qTokens, qNgrams) * entry.weight,
    i
  }));

  const answer = composeAnswer(question, scored, title, description, false);
  if (answer) return answer;

  /* Contextual fallback: keyword overlap check */
  const articleKeywords = tokenize(title + " " + description)
    .filter(w => w.length > 4)
    .slice(0, 6);

  const questionKeywords = qTokens.filter(w => w.length > 3).slice(0, 4);

  if (questionKeywords.length && articleKeywords.length) {
    const overlap = questionKeywords.filter(w => articleKeywords.includes(w));
    if (overlap.length) {
      return `This article does not contain a direct answer, but it covers **${overlap.join(", ")}** in the context of **${title}**.\n\n${description}\n\n*Try asking about the main topic, key players, or specific outcomes mentioned in the article.*`;
    }
  }

  /* Also search opened articles as a final fallback */
  if (OPENED_ARTICLES.length > 0) {
    const fallbackCorpus = [];
    OPENED_ARTICLES.forEach((art, idx) => {
      buildCorpus(art, 1.0).forEach(entry => fallbackCorpus.push({ ...entry, artIdx: idx }));
    });

    const fallbackScored = fallbackCorpus.map((entry, i) => ({
      s:      entry.s,
      score:  scoreSentence(entry.s, qTokens, qNgrams) * entry.weight,
      i,
      source: entry.source
    }));

    const bestFallback = fallbackScored.filter(x => x.score >= 0.15).sort((a, b) => b.score - a.score).slice(0, 3);
    if (bestFallback.length) {
      const text = bestFallback.map(x => x.s).join(" ");
      const src  = bestFallback[0].source;
      return `I found relevant information in another article you read — **"${src}"**:\n\n${text}`;
    }
  }

  return `The article **"${title}"** does not appear to contain a specific answer to that question.\n\n**Article summary:** ${description}\n\n*Try rephrasing your question using terms from the article, or ask about the main topic, impact, or technical details.*`;
}

/* ═══════════════════════════════════════════════════════════════════
   MULTI-ARTICLE MEMORY HELPERS
═══════════════════════════════════════════════════════════════════ */
function addToOpenedArticles(articleData) {
  if (!articleData || !articleData.title) return;

  /* Deduplicate by title */
  const existingIdx = OPENED_ARTICLES.findIndex(
    a => normalizeTitle(a.title) === normalizeTitle(articleData.title)
  );

  const entry = {
    title:       articleData.title       || "",
    description: articleData.description || "",
    content:     articleData.content     || "",
    category:    articleData.category    || "technology",
    source:      articleData.source      || "Unknown",
    openedAt:    new Date().toISOString()
  };

  if (existingIdx !== -1) {
    /* Move to front (most-recently opened) */
    OPENED_ARTICLES.splice(existingIdx, 1);
  }

  OPENED_ARTICLES.unshift(entry);

  /* Cap at MAX_OPENED */
  if (OPENED_ARTICLES.length > MAX_OPENED) {
    OPENED_ARTICLES = OPENED_ARTICLES.slice(0, MAX_OPENED);
  }
}

async function persistOpenedArticle(articleData) {
  addToOpenedArticles(articleData);

  if (!db) return;
  try {
    const col = db.collection("opened_articles");

    /* Upsert by title */
    await col.updateOne(
      { title: articleData.title },
      {
        $set: {
          title:       articleData.title       || "",
          description: articleData.description || "",
          content:     (articleData.content    || "").slice(0, 8000),
          category:    articleData.category    || "technology",
          source:      articleData.source      || "Unknown",
          openedAt:    new Date()
        }
      },
      { upsert: true }
    );

    /* Enforce MAX_OPENED in DB */
    const count = await col.countDocuments();
    if (count > MAX_OPENED) {
      const oldest = await col.find().sort({ openedAt: 1 }).limit(count - MAX_OPENED).toArray();
      const ids = oldest.map(d => d._id);
      if (ids.length) await col.deleteMany({ _id: { $in: ids } });
    }
  } catch (err) {
    console.warn("⚠️  persistOpenedArticle DB write failed:", err.message);
  }
}

async function loadOpenedArticlesFromDB() {
  if (!db) return;
  try {
    const docs = await db.collection("opened_articles")
      .find({})
      .sort({ openedAt: -1 })
      .limit(MAX_OPENED)
      .toArray();

    OPENED_ARTICLES = docs.map(d => ({
      title:       d.title       || "",
      description: d.description || "",
      content:     d.content     || "",
      category:    d.category    || "technology",
      source:      d.source      || "Unknown",
      openedAt:    d.openedAt ? d.openedAt.toISOString() : new Date().toISOString()
    }));
    console.log(`✅ Loaded ${OPENED_ARTICLES.length} opened articles from DB`);
  } catch (err) {
    console.warn("⚠️  loadOpenedArticlesFromDB failed:", err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   REFRESH CACHE
═══════════════════════════════════════════════════════════════════ */
async function refreshCache() {
  if (!db) { console.warn("⚠️  Cannot refresh cache: MongoDB not connected"); return; }
  try {
    console.log("🔄 Refreshing cache...");
    const data = await db.collection("articles")
      .find({})
      .sort({ _id: -1 })
      .limit(100)
      .toArray();

    const normalized = data.map(normalizeArticle).filter(Boolean);
    normalized.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    CACHE       = normalized.slice(0, 50);
    LAST_UPDATE = Date.now();
    console.log(`✅ Cache refreshed: ${CACHE.length} articles`);
  } catch (err) {
    console.warn("❌ refreshCache:", err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ARTICLE SCRAPER
═══════════════════════════════════════════════════════════════════ */
async function getFullArticle(url) {
  if (!unfluff) return "";
  try {
    const res = await axios.get(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = unfluff(res.data);
    const text = (data.text || "").replace(/\s+/g, " ").trim();
    if (!isEnglish(text) || text.split(" ").length < 300) return "";
    return text;
  } catch { return ""; }
}

/* ═══════════════════════════════════════════════════════════════════
   NEWS API URL
═══════════════════════════════════════════════════════════════════ */
function getNewsUrl() {
  const topic = randomItem(TOPICS);
  return `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${process.env.NEWS_API_KEY}`;
}

/* ═══════════════════════════════════════════════════════════════════
   FETCH NEWS
═══════════════════════════════════════════════════════════════════ */
async function fetchNews() {
  if (isFetching) return;
  if (!db)                        { console.warn("⚠️  fetchNews skipped: MongoDB not connected"); return; }
  if (!process.env.NEWS_API_KEY)  { console.warn("⚠️  fetchNews skipped: NEWS_API_KEY missing");  return; }
  if (newsApiDisabled)            { console.warn("⚠️  fetchNews skipped: NewsAPI key invalid (401/403)"); return; }

  isFetching = true;
  try {
    console.log("🔄 Fetching news...");
    const response = await axios.get(getNewsUrl(), { timeout: 15000 });
    const incoming = response.data.articles || [];

    const existingDocs = await db.collection("articles")
      .find({}, { projection: { title: 1, description: 1 } })
      .toArray();

    const existingKeys = new Set(
      existingDocs.map(a => normalizeTitle((a.title || "") + " " + (a.description || "")))
    );

    let added = 0;
    for (const article of shuffle(incoming)) {
      if (!article.title || !article.description || !article.url) continue;
      if (article.title.length < 20 || article.description.length < 40) continue;

      const key = normalizeTitle((article.title || "") + " " + (article.description || ""));
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const scraped  = await getFullArticle(article.url);
      const source   = article.source?.name || "NewsAPI";
      const content  = buildLongFormArticle(article.title, article.description, source, scraped);
      const imageUrl = getSafeImage(article.urlToImage, article.image);

      try {
        await db.collection("articles").insertOne({
          title:        article.title,
          description:  article.description,
          content,
          source,
          image_url:    imageUrl,
          article_url:  article.url,
          category:     "technology",
          published_at: article.publishedAt,
          publishedAt:  article.publishedAt,
          createdAt:    new Date()
        });
        added++;
      } catch (insertErr) {
        if (insertErr.code !== 11000) console.warn("❌ Insert:", insertErr.message);
      }
    }

    console.log(`✅ Added ${added} articles`);
    await refreshCache();
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      newsApiDisabled = true;
      console.error(`❌ fetchNews: NewsAPI auth failed (${status}) — your NEWS_API_KEY is invalid or expired. Disabling further fetch attempts. Please update your .env file.`);
    } else {
      console.warn("❌ fetchNews:", err.message);
    }
  } finally {
    isFetching = false;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   DATABASE DEDUP + CLEANUP
═══════════════════════════════════════════════════════════════════ */
async function cleanupAndDeduplicateDatabase() {
  if (!db) return;
  console.log("🧼 Starting dedup sweep...");
  try {
    const articles = await db.collection("articles").find({}).toArray();
    console.log(`🧼 Loaded ${articles.length} articles for sweep`);

    const bulkUpdates    = [];
    const cleanedArticles = [];
    let   cleanCount      = 0;

    for (const art of articles) {
      const src     = (art.source && typeof art.source === "object") ? art.source.name : (art.source || "Prometheus");
      const cleaned = cleanAndSummarizeLocal(art.title, art.description, art.content || "", src);
      const safeImg = getSafeImage(art.image_url, art.urlToImage, art.image);
      const needsUpdate = (art.content || "") !== cleaned || art.image_url !== safeImg;

      if (needsUpdate) {
        bulkUpdates.push({
          updateOne: {
            filter: { _id: art._id },
            update: { $set: { content: cleaned, image_url: safeImg } }
          }
        });
        art.content   = cleaned;
        art.image_url = safeImg;
        cleanCount++;
      }
      cleanedArticles.push(art);
    }

    if (bulkUpdates.length) {
      await db.collection("articles").bulkWrite(bulkUpdates);
      console.log(`🧼 Cleaned ${cleanCount} articles`);
    }

    const toDelete = [];
    const visited  = new Set();
    let   dupCount = 0;

    for (let i = 0; i < cleanedArticles.length; i++) {
      const a1  = cleanedArticles[i];
      const id1 = a1._id.toString();
      if (visited.has(id1)) continue;

      const group = [a1];
      const tw1   = getWords(a1.title || "");
      const dw1   = getWords(a1.description || "");
      const u1    = normalizeUrl(a1.article_url || a1.url || "");

      for (let j = i + 1; j < cleanedArticles.length; j++) {
        const a2  = cleanedArticles[j];
        const id2 = a2._id.toString();
        if (visited.has(id2)) continue;

        const tw2 = getWords(a2.title || "");
        const dw2 = getWords(a2.description || "");
        const u2  = normalizeUrl(a2.article_url || a2.url || "");

        const isDup =
          (u1 && u2 && u1 === u2) ||
          (tw1.size && tw2.size && jaccardSimilarity(tw1, tw2) > 0.60) ||
          (dw1.size && dw2.size && jaccardSimilarity(dw1, dw2) > 0.60);

        if (isDup) { group.push(a2); visited.add(id2); }
      }
      visited.add(id1);

      if (group.length > 1) {
        dupCount++;
        group.sort((a, b) => getQualityScore(b) - getQualityScore(a));
        for (let k = 1; k < group.length; k++) toDelete.push(group[k]._id);
      }
    }

    if (toDelete.length) {
      const res = await db.collection("articles").deleteMany({ _id: { $in: toDelete } });
      console.log(`🧼 Deleted ${res.deletedCount} duplicates across ${dupCount} groups`);
    } else {
      console.log("🧼 No duplicates found");
    }
  } catch (err) {
    console.error("❌ cleanupAndDeduplicateDatabase:", err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════════════════════════════ */

/* Status */
app.get("/api/status", (req, res) => {
  res.json({
    status:         "ok",
    cacheSize:      CACHE.length,
    lastUpdate:     LAST_UPDATE,
    mongodb:        !!db,
    newsapi:        !!process.env.NEWS_API_KEY,
    openedArticles: OPENED_ARTICLES.length,
    uptime:         Math.floor(process.uptime()) + "s",
    missing:        MISSING
  });
});

/* Articles */
app.get("/api/articles", async (req, res) => {
  res.json(CACHE.length ? shuffle(CACHE) : []);
  if (Date.now() - LAST_UPDATE > 120000) fetchNews().catch(() => {});
});

/* Search */
app.get("/api/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  if (db) {
    try {
      const data = await db.collection("articles")
        .find({ $text: { $search: q } })
        .limit(50)
        .toArray();
      return res.json(data.map(normalizeArticle).filter(Boolean));
    } catch (err) {
      console.warn("❌ DB search failed, falling back to in-memory:", err.message);
    }
  }

  const ql = q.toLowerCase();
  const results = CACHE.filter(a =>
    (a.title       || "").toLowerCase().includes(ql) ||
    (a.description || "").toLowerCase().includes(ql)
  );
  res.json(results);
});

/* Article Chatbot — Groq AI with full memory context */
app.post("/api/article-chat", async (req, res) => {
  try {
    const { question, article, memory } = req.body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ response: "Question is required" });
    }

    /* Build current article text */
    const artTitle   = (article?.title       || "").trim();
    const artDesc    = (article?.description || "").trim();
    const artContent = ((article?.content    || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim())
      .slice(0, 4000);

    const articleText = artTitle
      ? `Title: ${artTitle}\nDescription: ${artDesc}\nContent: ${artContent}`
      : "No article currently selected.";

    /* Build memory text from previously opened articles */
    const memoryItems = Array.isArray(memory) ? memory.slice(0, 10) : OPENED_ARTICLES.slice(0, 10);
    const memoryText  = memoryItems.length
      ? memoryItems.map((a, i) =>
          `[Article ${i + 1}] ${a.title || "Untitled"}\n${(a.description || "").slice(0, 200)}\n${(a.content || "").slice(0, 600)}`
        ).join("\n\n---\n\n")
      : "No previous articles in memory.";

    const systemPrompt = `You are Prometheus — an elite AI research assistant embedded in a tech news platform.

Your role: Provide sharp, analytical, contextually-aware answers about technology news.

Capabilities:
- Analyze the currently opened article in depth
- Cross-reference multiple articles the user has read
- Compare companies, products, and strategies across articles
- Identify trends, investment signals, and market implications
- Provide concise bullet-point breakdowns when useful
- Never give shallow one-liners; always add insight and context

Response rules:
- Use markdown formatting (bold, bullets) for clarity
- Cite article titles when referencing specific content
- If comparing multiple articles, structure the comparison clearly
- Provide analysis beyond what is literally stated — infer implications
- Keep responses focused and under 400 words unless a summary is requested
- Never say "I cannot access" — use what is in the provided context`;

    const userPrompt = `QUESTION: ${question}

CURRENT ARTICLE:
${articleText}

PREVIOUSLY READ ARTICLES (memory):
${memoryText}`;

    const completion = await groq.chat.completions.create({
      model:       "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   }
      ],
      temperature: 0.65,
      max_tokens:  600
    });

    const reply = completion.choices?.[0]?.message?.content || "No response generated.";
    res.json({ response: reply });

  } catch (err) {
    console.error("❌ Groq article-chat error:", err.message);

    /* Graceful fallback — never expose raw error to user */
    res.json({ response: "AI is momentarily unavailable. Please try again in a moment." });
  }
});

/* Generate dynamic Prompt Prometheus suggestions */
app.post("/api/generate-prompts", async (req, res) => {
  try {
    const { headlines, openedTitles } = req.body;
    const headlinesSample = (headlines || []).slice(0, 15).join("\n");
    const openedSample    = (openedTitles || []).slice(0, 5).join("\n");

    if (!headlinesSample) {
      return res.json({ prompts: [] });
    }

    const completion = await groq.chat.completions.create({
    model:       "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `You generate exactly 4 short, specific, compelling questions a tech analyst would ask about a news feed.
Rules:
- Each prompt is 6-10 words
- Base them on the actual headlines provided
- Make them analytical and specific (not generic)
- Reference real company/product names from the headlines
- Return ONLY a JSON array of 4 strings, nothing else`
        },
        {
          role: "user",
          content: `CURRENT HEADLINES:\n${headlinesSample}\n\nUSER'S RECENTLY READ:\n${openedSample || "None yet"}\n\nGenerate 4 dynamic prompt suggestions as a JSON array.`
        }
      ],
      temperature: 0.8,
      max_tokens:  200
    });

    const raw = completion.choices?.[0]?.message?.content || "[]";
    // Robustly extract JSON array — model sometimes wraps it in markdown or adds preamble
    let prompts = [];
    try {
      // Try to extract first JSON array from the response
      const match = raw.match(/\[[\s\S]*?\]/);
      const clean = match ? match[0] : raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      prompts = Array.isArray(parsed) ? parsed : [];
    } catch(_) {
      // Last resort: extract quoted strings
      const fallback = [...raw.matchAll(/"([^"]{8,80})"/g)].map(m => m[1]).slice(0, 4);
      prompts = fallback;
    }
    res.json({ prompts: prompts.filter(p => typeof p === 'string' && p.length > 4).slice(0, 4) });

  } catch (err) {
    console.error("❌ /api/generate-prompts:", err.message);
    res.json({ prompts: [] });
  }
});

/* Store Opened Article — called automatically when user opens an article */
app.post("/api/store-opened-article", async (req, res) => {
  const { title, description, content, category, source } = req.body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ success: false, error: "title is required" });
  }

  try {
    await persistOpenedArticle({ title, description, content, category, source });
    res.json({
      success:       true,
      totalOpened:   OPENED_ARTICLES.length,
      message:       `Article stored. Memory contains ${OPENED_ARTICLES.length} article(s).`
    });
  } catch (err) {
    console.error("❌ /api/store-opened-article:", err.message);
    res.status(500).json({ success: false, error: "Failed to store article" });
  }
});

/* Opened articles memory (debugging / status) */
app.get("/api/opened-articles", (req, res) => {
  res.json({
    count:    OPENED_ARTICLES.length,
    articles: OPENED_ARTICLES.map(a => ({
      title:    a.title,
      source:   a.source,
      openedAt: a.openedAt
    }))
  });
});

/* Manual fetch trigger */
app.get("/fetch-now", (req, res) => {
  fetchNews().catch(() => {});
  res.json({ message: "Fetch started in background" });
});

/* Main website */

app.use(express.static(path.join(__dirname, "public", "public")));

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "public", "classic.html")
  );
});


/* React analytics */
app.use(
  "/analysis",
  express.static(path.join(__dirname, "public", "build"))
);

app.get("/analysis*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "build", "index.html")
  );
});
/* ═══════════════════════════════════════════════════════════════════
   START SERVER
═══════════════════════════════════════════════════════════════════ */
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🚀 Prometheus server listening on PORT ${PORT}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  (async () => {
    await connectMongo();

    console.log(`MongoDB        : ${db ? "✅" : "❌"}`);
    console.log(`NewsAPI        : ${process.env.NEWS_API_KEY ? "✅" : "❌"}`);
    console.log(`AI Engine      : ✅ Local QA (offline, zero cost)`);
    console.log(`Article Memory : ✅ Multi-article (up to ${MAX_OPENED})`);

    if (db) {
      await loadOpenedArticlesFromDB().catch(e => console.warn("⚠️  Opened articles load skipped:", e.message));
      await cleanupAndDeduplicateDatabase().catch(e => console.warn("⚠️  Dedup skipped:", e.message));
      await refreshCache().catch(e => console.warn("⚠️  Cache skip:", e.message));
    }

    if (!CACHE.length) {
      console.log("⚡ Initial news fetch...");
      await fetchNews().catch(e => console.warn("⚠️  Initial fetch skipped:", e.message));
    }

    if (process.env.NEWS_API_KEY && db) {
      cron.schedule("*/10 * * * *", () => {
        console.log("⏰ Cron fetch...");
        fetchNews().catch(() => {});
      });
    }
  })();
});

server.on("error", err => {
  console.error("❌ Server error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Set a different PORT in .env`);
    process.exit(1);
  }
});

process.on("uncaughtException",  err    => console.error("❌ Uncaught Exception:",  err.message));
process.on("unhandledRejection", reason => console.error("❌ Unhandled Rejection:", reason?.message || reason));