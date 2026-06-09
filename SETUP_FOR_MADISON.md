# Augusta Concierge — Setup Guide

The chatbot is the visitor-facing piece. **This doc covers the artist-submission pipeline** (Google Form → Make.com → events feed), which is Madison's side.

End-to-end flow:

```
Artist fills Google Form
        ↓
New row in Google Sheet
        ↓
Make.com triggers
        ↓
Email Seth Young at Augusta with Approve / Reject buttons
        ↓
On Approve: row's "approved" cell flips to TRUE
        ↓
Chatbot reads only approved rows → answers tourist questions
```

## Part 1 — Google Form (artist event submission)

Create a new Google Form titled **"Submit an Elkins Arts Event"**.

Required fields (mark with red asterisk):

| Field name | Field type | Help text |
|---|---|---|
| Event title | Short answer | e.g. "Bluegrass Faculty Showcase" |
| Your name or organization | Short answer | The artist or org hosting the event |
| Category | Multiple choice | Workshop · Concert · Exhibition · Performance · Community · Other |
| Start date | Date | First day of the event |
| End date | Date | Same as start date for one-day events |
| Start time | Time | Local time |
| Location | Short answer | Venue name and street address |
| Price | Short answer | e.g. "$15", "Free", "Sliding scale" |
| Description | Paragraph | 2–3 sentences. What is it, who is it for? |
| Contact email | Short answer | We may follow up; not shown to public |

Optional field:

| Image URL | Short answer | Link to a photo on Instagram/website. We may use it on the events page. |

**Form settings:**
- Collect email addresses: ON
- Limit to 1 response: OFF (artists can submit multiple events)
- Show progress bar: ON

**Link the form to a Google Sheet** (Responses tab → green Sheets icon). Title the sheet **"Augusta Concierge Events"**.

After it's linked, **add two columns manually** at the right end of the sheet:
- Column header: `approved` — default value: `FALSE`
- Column header: `notes` — for Seth's internal notes if he rejects something

## Part 2 — Make.com scenario (moderation flow)

Sign up at make.com (free tier covers this — 1,000 ops/month).

**Scenario name:** "Augusta Event Moderation"

**Steps:**

1. **Trigger: Google Sheets → Watch Rows**
   - Spreadsheet: Augusta Concierge Events
   - Sheet: Form Responses 1
   - Limit: 1 row per run
   - Run every: 15 minutes

2. **Action: Gmail → Send Email** (or Email → Send Email)
   - From: a shared inbox or Madison's account
   - To: seth@augustaartsandculture.org
   - Subject: `New event submission — {{1.Event title}}`
   - Body (HTML):
     ```
     <h3>New event submitted for Augusta concierge</h3>
     <p><strong>{{1.Event title}}</strong> — {{1.Your name or organization}}</p>
     <p>{{1.Start date}} {{1.Start time}} · {{1.Location}}<br>
     {{1.Price}}</p>
     <p>{{1.Description}}</p>
     <p>
       <a href="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit">Open the sheet to approve</a>
       — change the <code>approved</code> column to <code>TRUE</code> to publish.
     </p>
     ```

That's the v1. Seth manually flips a cell to publish. Simple, no risk of bad data hitting the bot.

**v2 (optional, post-presentation):** Use Make.com's "Webhook → wait for confirmation" pattern with two real buttons (Approve / Reject) that POST back to Make and update the sheet automatically. Skip for the June 18 demo.

## Part 3 — Sync the sheet to the chatbot

For the prototype, the chatbot reads from a local `data/events.csv` file. Tyler can re-export the Google Sheet to that file before the demo, or wire a 30-line script that fetches the sheet at server start. Either is fine for June 18.

Post-demo, the right answer is: Make.com second scenario, "every 10 minutes: pull approved rows from sheet → write to a JSON file the bot reads from."

## Talking points for the CPA presentation (June 18)

- **Cost story:** Hosting on Vercel free tier ($0) + Claude Haiku API (~$0.001 per visitor question) + Make.com free tier ($0) = **under $5/month at projected traffic**. Compare to hiring a part-time staffer to maintain an events page: ~$8K/year.
- **Effort story:** Artist submits in 60 seconds. Seth approves in one click. Visitor gets a current, personalized answer in 2 seconds. No new staff workflow.
- **Brand story:** Closes Augusta's biggest discoverability gap (zero Google results for "Appalachian folk music workshops") by giving visitors a direct concierge instead of fighting for SEO rank.
- **AI story:** Powered by Anthropic's Claude — same engine as ChatGPT — with a knowledge base curated for Augusta and a live events feed approved by Augusta staff. The bot can't make things up because it only answers from approved content.
