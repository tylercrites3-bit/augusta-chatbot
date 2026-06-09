import express from "express";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { refreshScrapedEvents, loadScrapedEvents } from "./scraper.js";
import { refreshSheetEvents, loadSheetEvents } from "./sheet_events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const PORT = process.env.PORT || 3000;
const MODEL = "gemini-2.5-flash-lite";

const hasKey = Boolean(process.env.GEMINI_API_KEY);
if (!hasKey) {
  console.warn(
    "\n[warn] No GEMINI_API_KEY set — static demo will render but the chat endpoint will return a stub.\n" +
      "       Get a free key at https://aistudio.google.com/apikey then put it in .env\n"
  );
}

const genAI = hasKey ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const KNOWLEDGE_PATH = path.join(__dirname, "data", "knowledge.md");
const EVENTS_PATH = path.join(__dirname, "data", "events.csv");

function loadKnowledge() {
  return fs.readFileSync(KNOWLEDGE_PATH, "utf8");
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function loadApprovedEvents() {
  const text = fs.readFileSync(EVENTS_PATH, "utf8");
  return parseCsv(text).filter((r) => String(r.approved).toLowerCase() === "true");
}

function formatEventsForPrompt(events) {
  if (events.length === 0) return "No events currently in the calendar.";
  return events
    .map((e) => {
      const date =
        e.start_date === e.end_date || !e.end_date
          ? e.start_date
          : `${e.start_date} through ${e.end_date}`;
      return `- ${e.title} — ${e.artist_or_org} (${e.category})\n  Date: ${date} at ${e.start_time}\n  Location: ${e.location}\n  Price: ${e.price}\n  ${e.description}`;
    })
    .join("\n\n");
}

function formatScrapedEventsForPrompt(scraped) {
  if (!scraped.events || scraped.events.length === 0) {
    return "(Augusta calendar has not been scraped yet.)";
  }
  return scraped.events
    .map((e) => {
      const dateLine =
        e.startDate && e.endDate
          ? e.startDate === e.endDate
            ? e.startDate
            : `${e.startDate} through ${e.endDate}`
          : e.dateText || "date TBD";
      const lines = [
        `- ${e.title}`,
        `  Date: ${dateLine}${e.timeText ? `, ${e.timeText}` : ""}`,
      ];
      if (e.location) lines.push(`  Location: ${e.location}`);
      if (e.description) lines.push(`  ${e.description}`);
      if (e.link) lines.push(`  Details: ${e.link}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildSystemPrompt() {
  const knowledge = loadKnowledge();
  const seededLocal = loadApprovedEvents();
  const sheetLocal = loadSheetEvents();
  const localEvents = [...seededLocal, ...sheetLocal.events];
  const scraped = loadScrapedEvents();
  const today = new Date().toISOString().slice(0, 10);

  return `You are the AI concierge for Augusta Heritage Center in Elkins, West Virginia. You help tourists plan visits, surface upcoming arts events, and connect visitors with local artists and venues.

Today's date is ${today}. When suggesting events, prefer ones that are upcoming relative to today.

Read the Augusta knowledge base, the live Augusta calendar (auto-synced from augustaartsandculture.org), and the wider Elkins arts events below carefully. Answer using only what is in them — never invent dates, prices, or artist names. If the user asks something you don't know, say so honestly and suggest they email info@augustaartsandculture.org.

When mentioning Augusta-hosted events, include the link from the calendar so the visitor can register or get more info.

Default to 3–6 sentences. Use bullet points when listing more than two events or recommendations. Warm, mountain-hospitable tone — like a knowledgeable local at the Elkins visitor center.

# AUGUSTA & ELKINS KNOWLEDGE BASE

${knowledge}

# AUGUSTA HERITAGE CENTER LIVE CALENDAR (auto-scraped from augustaartsandculture.org/events; last refresh ${scraped.scrapedAt || "never"})

${formatScrapedEventsForPrompt(scraped)}

# WIDER ELKINS ARTS EVENTS (curated baseline + live artist submissions from the Google Form; last sheet refresh ${sheetLocal.fetchedAt || "never"})

${formatEventsForPrompt(localEvents)}`;
}

function toGeminiHistory(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    if (!hasKey) {
      return res.json({
        reply:
          "**Demo mode** — no GEMINI_API_KEY is set, so I'm returning a stub. Once Tyler drops his free Gemini key into `.env`, the bot will answer for real using the Augusta knowledge base and live events feed. Get a key at https://aistudio.google.com/apikey",
      });
    }

    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: buildSystemPrompt(),
    });

    const history = toGeminiHistory(messages.slice(0, -1));
    const lastUser = messages[messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastUser.content);
    const text = result.response.text();

    res.json({ reply: text });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({
      error: err?.message || "Something went wrong",
    });
  }
});

app.get("/api/health", (_req, res) => {
  const scraped = loadScrapedEvents();
  const sheet = loadSheetEvents();
  res.json({
    ok: true,
    model: MODEL,
    keyLoaded: hasKey,
    seededLocalEvents: loadApprovedEvents().length,
    sheetEvents: {
      count: sheet.count,
      lastRefresh: sheet.fetchedAt,
    },
    augustaScraped: {
      count: scraped.count,
      lastRefresh: scraped.scrapedAt,
    },
  });
});

async function refreshAll() {
  await Promise.allSettled([refreshScrapedEvents(), refreshSheetEvents()]);
}

app.listen(PORT, () => {
  console.log(`\nAugusta concierge running at http://localhost:${PORT}\n`);
  refreshAll();
  setInterval(refreshAll, REFRESH_INTERVAL_MS);
});
