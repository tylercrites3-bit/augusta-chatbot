import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQXRFxmfM---4qj0Ci-Z3EM24ky2DODtdFFIsRRJBc7HeziLyne7gmkaZ8ABKAJLaqxXsXi0njvwx5u/pub?gid=1078269900&single=true&output=csv";

const OUTPUT_PATH = path.join(__dirname, "data", "sheet_events.json");

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

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}

function normalizeDate(s) {
  if (!s) return "";
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return s;
}

export async function fetchSheetEvents() {
  const res = await fetch(SHEET_CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch returned ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  return rows
    .filter((r) => {
      const v = String(r.Approved || "").trim().toLowerCase();
      return v === "approved" || v === "true";
    })
    .map((r) => ({
      title: r["Event title"],
      artist_or_org: r["Your name or organization"],
      category: r["Category"],
      start_date: normalizeDate(r["Start date"]),
      end_date: normalizeDate(r["End date"]),
      start_time: r["Start time"],
      location: r["Location"],
      price: r["Price"],
      description: r["Description"],
      submitted_by: r["Your contact email"],
    }));
}

export async function refreshSheetEvents() {
  try {
    const events = await fetchSheetEvents();
    const payload = {
      fetchedAt: new Date().toISOString(),
      source: SHEET_CSV_URL,
      count: events.length,
      events,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(`[sheet] refreshed ${events.length} approved events from Google Sheet`);
    return payload;
  } catch (err) {
    console.error("[sheet] refresh failed:", err.message);
    return null;
  }
}

export function loadSheetEvents() {
  if (!fs.existsSync(OUTPUT_PATH)) return { fetchedAt: null, count: 0, events: [] };
  return JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshSheetEvents().then(() => process.exit(0));
}
