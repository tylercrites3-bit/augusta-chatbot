# Augusta Concierge — Prototype

AI chatbot for Augusta Heritage Center. Helps tourists discover workshops, concerts, and local artists in Elkins, WV.

Built for the Maust accounting project (Team 3), final presentation June 18, 2026.

**Powered by Google Gemini 2.0 Flash — runs on the free tier, $0/month.**

## Run locally

```bash
cd augusta-chatbot
cp .env.example .env       # then paste your free Gemini key into .env
npm install
npm run dev
```

Open http://localhost:3000 — the demo Augusta site loads with the chat widget bottom-right.

## Get a free Gemini API key (2 minutes, no credit card)

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click **Create API key** → copy the key
4. Paste into `.env`: `GEMINI_API_KEY=AIza...`

Free tier limits: 15 requests/minute, 1,500 requests/day on Gemini 2.0 Flash. More than enough for a demo and well beyond what Augusta would ever hit in production.

## Files

- `server.js` — Express server + `/api/chat` Gemini proxy
- `public/index.html` — demo Augusta site (placeholder)
- `public/widget.js` + `widget.css` — the chat widget (drop-in `<script src="/widget.js">` to embed on the real Augusta site)
- `data/knowledge.md` — bot's knowledge base about Augusta + Elkins arts
- `data/events.csv` — events the bot can mention (only rows with `approved=true` are used)
- `SETUP.md` — Google Form + (optional) Make.com pipeline for artists to submit events

## Deploy for free

Push to GitHub → import to Vercel → set `GEMINI_API_KEY` env var → live URL. Vercel's free tier is plenty.

## Cost summary for the CPA presentation

| Item | Cost |
|---|---|
| Hosting (Vercel free tier) | $0 |
| LLM (Gemini 2.0 Flash free tier, ~1,500 queries/day) | $0 |
| Event intake (Google Form + Google Sheet) | $0 |
| **Total monthly cost to Augusta** | **$0** |
