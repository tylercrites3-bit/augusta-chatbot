import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_URL = "https://augustaartsandculture.org/events/";
const OUTPUT_PATH = path.join(__dirname, "data", "scraped_events.json");

const MONTH_MAP = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function parseDateRange(dateText, year, monthHint) {
  if (!dateText) return { startDate: null, endDate: null };
  const t = dateText.trim();

  let m = t.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9})$/);
  if (m) {
    const month = MONTH_MAP[m[3].toLowerCase().slice(0, 3)] || monthHint;
    return {
      startDate: `${year}-${month}-${pad(m[1])}`,
      endDate: `${year}-${month}-${pad(m[2])}`,
    };
  }

  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})$/);
  if (m) {
    const month = MONTH_MAP[m[2].toLowerCase().slice(0, 3)] || monthHint;
    const d = `${year}-${month}-${pad(m[1])}`;
    return { startDate: d, endDate: d };
  }

  m = t.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
  if (m) {
    const month = MONTH_MAP[m[1].toLowerCase().slice(0, 3)] || monthHint;
    return {
      startDate: `${year}-${month}-${pad(m[2])}`,
      endDate: `${year}-${month}-${pad(m[3])}`,
    };
  }

  return { startDate: null, endDate: null };
}

function yearMonthFromArticleClass(classAttr) {
  const m = (classAttr || "").match(/mec-toggle-(\d{4})(\d{2})-/);
  if (m) return { year: m[1], monthHint: m[2] };
  return { year: String(new Date().getFullYear()), monthHint: null };
}

export async function scrapeAugustaEvents() {
  const res = await fetch(EVENTS_URL, {
    headers: { "User-Agent": "AugustaConciergeBot/0.1 (Maust project demo)" },
  });
  if (!res.ok) throw new Error(`Augusta events page returned ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const seenLinks = new Set();
  const events = [];

  $("article.mec-event-article").each((_, el) => {
    const $el = $(el);
    const link = $el.find("a[href*='/events/']").first().attr("href") || "";
    if (!link || seenLinks.has(link)) return;
    seenLinks.add(link);

    const title = $el.find(".mec-event-title").text().trim();
    const description = $el.find(".mec-event-description").text().trim().replace(/\s+/g, " ");
    const dateText = $el.find(".mec-date-details").text().trim().replace(/\s+/g, " ");
    const timeText = $el.find(".mec-time-details").text().trim().replace(/\s+/g, " ");
    const locationText = $el.find(".mec-event-loc-place, .mec-event-location, [class*='loc']").text().trim().replace(/\s+/g, " ");

    const { year, monthHint } = yearMonthFromArticleClass($el.attr("class"));
    const { startDate, endDate } = parseDateRange(dateText, year, monthHint);

    if (title) {
      events.push({
        title,
        link,
        startDate,
        endDate,
        dateText,
        timeText,
        location: locationText,
        description,
      });
    }
  });

  return events;
}

export async function refreshScrapedEvents() {
  try {
    const events = await scrapeAugustaEvents();
    const payload = {
      scrapedAt: new Date().toISOString(),
      source: EVENTS_URL,
      count: events.length,
      events,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(`[scraper] refreshed ${events.length} events from Augusta at ${payload.scrapedAt}`);
    return payload;
  } catch (err) {
    console.error("[scraper] refresh failed:", err.message);
    return null;
  }
}

export function loadScrapedEvents() {
  if (!fs.existsSync(OUTPUT_PATH)) return { scrapedAt: null, count: 0, events: [] };
  return JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshScrapedEvents().then(() => process.exit(0));
}
