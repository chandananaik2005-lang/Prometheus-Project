require("dns").setDefaultResultOrder("ipv4first");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");
const OpenAI = require("openai");

/* ═══════════════════════════════════
   APP
═══════════════════════════════════ */
const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

app.use(express.json({ limit: "10mb" }));

app.use(express.static(path.join(__dirname, "public")));

/* ═══════════════════════════════════
   PORT
═══════════════════════════════════ */
const PORT = process.env.PORT || 5000;

/* ═══════════════════════════════════
   ENV CHECK
═══════════════════════════════════ */
const MISSING = [];

if (!process.env.OPENAI_API_KEY)
  MISSING.push("OPENAI_API_KEY");

if (!process.env.SUPABASE_URL)
  MISSING.push("SUPABASE_URL");

if (!process.env.SUPABASE_KEY)
  MISSING.push("SUPABASE_KEY");

if (!process.env.NEWS_API_KEY)
  MISSING.push("NEWS_API_KEY");

if (MISSING.length) {
  console.warn("⚠️ Missing env vars:", MISSING.join(", "));
}

/* ═══════════════════════════════════
   OPENAI
═══════════════════════════════════ */
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

/* ═══════════════════════════════════
   SUPABASE
═══════════════════════════════════ */
let supabase = null;

try {
  if (
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_KEY
  ) {
supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: WebSocket
    }
  }
);

    console.log("✅ Supabase connected");
  } else {
    console.warn("⚠️ Supabase credentials missing");
  }
} catch (err) {
  console.log("❌ Supabase init failed:", err.message);
}

/* ═══════════════════════════════════
   UNFLUFF
═══════════════════════════════════ */
let unfluff = null;

(async () => {
  try {
    const mod = await import("unfluff");
    unfluff = mod.default || mod;
    console.log("✅ unfluff loaded");
  } catch {
    console.warn("⚠️ unfluff unavailable");
  }
})();

/* ═══════════════════════════════════
   CONFIG
═══════════════════════════════════ */
const MIN_WORDS = 1500;

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
  "google ai",
  "tesla autopilot",
  "microsoft copilot",
  "cloud computing",
  "quantum computing",
  "electric vehicles"
];

/* ═══════════════════════════════════
   CACHE
═══════════════════════════════════ */
let CACHE = [];
let LAST_UPDATE = 0;
let isFetching = false;

/* ═══════════════════════════════════
   HELPERS
═══════════════════════════════════ */
function shuffle(arr = []) {
  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function normalizeTitle(t = "") {
  return t.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function isEnglish(text = "") {
  if (!text || text.length < 10) return false;

  const eng = (text.match(/[a-zA-Z]/g) || []).length;

  return eng / text.length > 0.55;
}

function randomTopic() {
  return TOPICS[
    Math.floor(Math.random() * TOPICS.length)
  ];
}

function getImageFallback(article) {
  const seed = normalizeTitle(article.title || "technology");

  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/500`;
}

/* ═══════════════════════════════════
   LONG ARTICLE GENERATOR
═══════════════════════════════════ */
function generateLongArticle(article) {

  return `
<h2>Introduction</h2>

<p>
${article.description || "Technology continues to evolve rapidly across industries worldwide."}
</p>

<p>
The latest developments in the technology sector are reshaping how businesses,
consumers, and governments interact with digital systems. Artificial intelligence,
automation, cloud computing, and cybersecurity remain major driving forces behind
global innovation.
</p>

<h2>Major Industry Developments</h2>

<p>
Companies are increasingly investing in advanced AI infrastructure, data analytics,
and machine learning systems to improve productivity and customer experiences.
Several organizations are integrating intelligent automation into daily operations,
allowing faster decision-making and scalable digital transformation.
</p>

<p>
Experts believe the competition between leading technology firms will intensify
as demand grows for AI-powered products, semiconductor technologies, and secure
cloud platforms. Governments are also focusing heavily on regulations,
privacy protection, and responsible AI deployment.
</p>

<h2>Future Outlook</h2>

<p>
The future of technology appears highly dynamic, with innovations expected in
robotics, autonomous systems, quantum computing, and next-generation internet
services. Analysts predict that emerging technologies will continue transforming
global industries, economic models, and digital lifestyles over the next decade.
</p>
`;
}

/* ═══════════════════════════════════
   SCRAPER
═══════════════════════════════════ */
async function getFullArticle(url) {
  if (!unfluff) return "";

  try {
    const res = await axios.get(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

    const data = unfluff(res.data);

    const text = (data.text || "")
      .replace(/\s+/g, " ")
      .trim();

    if (
      !isEnglish(text) ||
      text.split(" ").length < 500
    ) {
      return "";
    }

    return text;
  } catch {
    return "";
  }
}

/* ═══════════════════════════════════
   NEWS URL
═══════════════════════════════════ */
function getNewsUrl() {
  return `https://newsapi.org/v2/everything?q=${encodeURIComponent(randomTopic())}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${process.env.NEWS_API_KEY}`;
}

/* ═══════════════════════════════════
   REFRESH CACHE
═══════════════════════════════════ */
async function refreshCache() {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("published_at", {
        ascending: false
      })
      .limit(50);

    if (error) {
      console.log("❌ Cache:", error.message);
      return;
    }

    CACHE = data || [];
    LAST_UPDATE = Date.now();

    console.log(`✅ Cache refreshed (${CACHE.length})`);
  } catch (err) {
    console.log("❌ refreshCache:", err.message);
  }
}

/* ═══════════════════════════════════
   FETCH NEWS
═══════════════════════════════════ */
async function fetchNews() {
  if (isFetching) return;

  if (!supabase) return;

  if (!process.env.NEWS_API_KEY) return;

  isFetching = true;

  try {
    console.log("🔄 Fetching news...");

    const response = await axios.get(
      getNewsUrl(),
      {
        timeout: 15000
      }
    );

    const incoming = response.data.articles || [];

    const { data: existingRows } =
      await supabase
        .from("articles")
        .select("title");

    const existingTitles = new Set(
      (existingRows || []).map((a) =>
        normalizeTitle(a.title)
      )
    );

    let added = 0;

    for (const article of shuffle(incoming)) {

      if (
        !article.title ||
        !article.description ||
        !article.url
      ) {
        continue;
      }

      const normalized = normalizeTitle(article.title);

      if (existingTitles.has(normalized)) {
        continue;
      }

      existingTitles.add(normalized);

      let content =
        await getFullArticle(article.url);

      if (
        !content ||
        content.split(" ").length < MIN_WORDS
      ) {
        content =
          generateLongArticle(article);
      }

      const { error } = await supabase
        .from("articles")
        .insert([{
          title: article.title,
          description: article.description,
          content,
          source:
            article.source?.name || "NewsAPI",
          image_url:
            article.urlToImage ||
            getImageFallback(article),
          category: "technology",
          published_at:
            article.publishedAt
        }]);

      if (!error) {
        added++;
      } else {
        console.log("❌ Insert:", error.message);
      }
    }

    console.log(`✅ Added ${added} articles`);

    await refreshCache();

  } catch (err) {
    console.log("❌ fetchNews:", err.message);
  } finally {
    isFetching = false;
  }
}

/* ═══════════════════════════════════
   ROUTES
═══════════════════════════════════ */

app.get("/api/articles", async (req, res) => {
  res.json(shuffle(CACHE));

  if (
    Date.now() - LAST_UPDATE > 120000
  ) {
    fetchNews().catch(() => {});
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (!q) {
      return res.json([]);
    }

    if (!supabase) {
      return res.json([]);
    }

    const { data } = await supabase
      .from("articles")
      .select("*")
      .or(
        `title.ilike.%${q}%,description.ilike.%${q}%`
      )
      .limit(20);

    res.json(data || []);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.post("/api/article-chat", async (req, res) => {
  try {

    if (!openai) {
      return res.json({
        response:
          "OpenAI API key missing."
      });
    }

    const { question, article } =
      req.body;

    const completion =
      await openai.chat.completions.create({
        model: "gpt-4o-mini",

        messages: [
          {
            role: "system",
            content:
              "You are an expert AI technology analyst."
          },
          {
            role: "user",
            content: `
ARTICLE:
${article?.title || ""}

${article?.content || ""}

QUESTION:
${question}
`
          }
        ],

        temperature: 0.7,
        max_tokens: 300
      });

    res.json({
      response:
        completion.choices[0]?.message
          ?.content || "No response."
    });

  } catch (err) {

    console.log("❌ Chatbot:", err.message);

    res.json({
      response:
        "AI temporarily unavailable."
    });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    cacheSize: CACHE.length,
    lastUpdate: LAST_UPDATE,
    openai: !!openai,
    supabase: !!supabase,
    newsapi: !!process.env.NEWS_API_KEY,
    uptime:
      Math.floor(process.uptime()) + "s",
    missing: MISSING
  });
});

app.get("/fetch-now", async (req, res) => {

  fetchNews();

  res.json({
    message:
      "Fetch started in background"
  });
});

/* IMPORTANT */
/* DO NOT USE '*' ROUTES */

app.use((req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

/* ═══════════════════════════════════
   CRON
═══════════════════════════════════ */
if (
  process.env.NEWS_API_KEY &&
  supabase
) {
  cron.schedule("*/10 * * * *", () => {
    console.log("⏰ Scheduled fetch...");
    fetchNews();
  });
}

/* ═══════════════════════════════════
   START SERVER
═══════════════════════════════════ */
app.listen(PORT, "0.0.0.0", async () => {

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🚀 Running on PORT ${PORT}`);
  console.log(`OpenAI   : ${openai ? "✅" : "❌"}`);
  console.log(`Supabase : ${supabase ? "✅" : "❌"}`);
  console.log(`NewsAPI  : ${process.env.NEWS_API_KEY ? "✅" : "❌"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await refreshCache();

  if (
    process.env.NEWS_API_KEY &&
    supabase
  ) {
    fetchNews().catch(() => {});
  }
});