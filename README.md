# Startup Funding Pulse

An AI-assisted weekly digest of Indian startup funding. Every Monday morning it pulls the past week's funding
news from live feeds, extracts the deals, counts the patterns in code, and emails a brief to a venture scout.

**Live site:** https://startup-funding-pulse-five.vercel.app

Built for Aarav, a venture scout at a Bengaluru family office. He skims two or three publications and catches about
60% of deals; his deal spreadsheet runs three weeks behind; and two companies next to one of his portfolio companies
raised money before he heard about it. Funding Pulse consolidates the week, puts his focus sectors and stages first,
flags watchlist companies and portfolio neighbours, and spots patterns, with a source link on every deal.

## Two rules the whole design rests on

**The Cut: numbers never come from the AI.**
- Gemini extracts deal fields, but every amount must be backed by an exact text span, and code checks the span appears
  word for word in the source article. If it does not, the amount becomes `undisclosed`.
- Currency and unit conversion (crore, lakh, million, billion, rupees, dollars) is done in code, not by Gemini.
- Every statistic (counts, totals, week-on-week change, new investors) is computed in code. Gemini only turns the
  statistics JSON into plain sentences. Code then checks that every number in those sentences exists in the
  statistics. If any does not, or a sentence hints at a number ("doubled") or a trend with no history behind it,
  Gemini's text is discarded and plain template sentences are used.

**The human gate: it reports, Aarav decides.** The brief never recommends whom to contact or what to tell LPs.
Low-relevance deals are never hidden; they appear under "Rest of the week". Portfolio-adjacency flags are labelled as
an AI judgement, with the reason and a source link, so they can be checked in one click.

## Architecture

Built to `docs/Funding_Pulse_Component_Map.jpg`. Rows are components; columns are Trigger, Input, Context,
Processing and Output.

| Component (row) | What it does | Code |
|---|---|---|
| **Aarav** | Edits his focus sectors, stages, watchlist and portfolio on a config page (Trigger/Input). Reads the brief (Output). | `app/config`, `app/page.tsx`, email |
| **Funding Pulse app** (Next.js on Vercel) | Cron trigger; pulls 7 days of articles; loads config and history; dedupes and counts in code; assembles the brief | `app/api/cron`, `lib/pipeline.ts`, `lib/ingest.ts`, `lib/normalize.ts`, `lib/verify.ts`, `lib/patterns.ts`, `lib/brief.ts` |
| **Gemini** (Flash) | Extracts deals (Processing); judges portfolio adjacency from the portfolio descriptions (Context); narrates the code-computed counts (Output) | `lib/gemini.ts`, `lib/extract.ts`, `lib/relevance.ts`, `lib/patterns.ts` |
| **News sources** | Live funding news: Inc42, Entrackr, YourStory, ET Startups, ET Tech, Google News searches. Every deal links back to its articles | `lib/sources.ts`, `lib/ingest.ts` |
| **Neon Postgres** (the map's "Supabase" row) | Stores config, raw articles, clean deals, briefs and run logs; serves history for week-on-week trends; is the live deal log | `db/schema.sql`, `lib/db.ts` |
| **Email API** (Resend) | Sends the Monday brief | `lib/email.ts` |

> Database note: the original plan used Supabase. Neon (also Postgres) was used instead; the schema and the
> "Supabase" row of the map are otherwise unchanged.

### The pipeline

Each stage reads from and writes to the database and skips work already done, so a run that stops part-way can
simply be started again.

1. **Ingest.** Fetches every active source, keeps articles from the window, marks likely funding news with a keyword
   filter, and records how many articles each source returned.
2. **Extract.** Gemini reads candidate articles in batches of 20 and returns deal fields as strict JSON.
3. **Verify, convert, merge** *(code only, the Cut).* Checks each amount's text span against the article, converts
   currency, normalises company names, and merges the same deal reported by several outlets.
4. **Relevance, watchlist, adjacency.** Code decides focus deals and watchlist hits. Gemini flags deals next to a portfolio company.
5. **Patterns.** Code counts; Gemini narrates; code number-checks the narration.
6. **Assemble and send.** Builds the email-safe HTML, saves it, shows it on the site, and emails it.

### Timing and limits (Vercel Hobby)

- The cron in `vercel.json` is `30 1 * * 1`: **Monday 01:30 UTC = 7:00 AM IST** (Vercel cron uses UTC).
  On the Hobby plan Vercel starts a daily cron *at some point in that hour*, so the brief lands between about
  7:00 and 8:00 AM IST rather than exactly on the minute. Pro plans are precise.
- Hobby functions can run up to 300 seconds. A full run takes about 1.5 minutes. If a run ever runs out of time it
  triggers itself again (up to three times) and resumes, because every stage is idempotent.
- The cron route requires `Authorization: Bearer $CRON_SECRET`.

## Setup

1. **Neon.** Create a project, open the SQL editor, and run `db/schema.sql`. Copy the *pooled* connection string.
2. **Gemini.** Create a key at https://aistudio.google.com.
3. **Resend.** Create an API key at https://resend.com. Without a verified domain Resend only sends from
   `onboarding@resend.dev` and only to the email address of the Resend account itself. That is why
   `RECIPIENT_EMAIL` must be the address you signed up to Resend with.
4. **Environment variables** (copy `.env.example` to `.env.local` locally; add the same in Vercel project settings):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | Gemini Flash model ID, e.g. `gemini-3.8-flash`. Swap without touching code |
| `DATABASE_URL` | Neon pooled connection string (server only) |
| `RESEND_API_KEY` | Resend key |
| `RECIPIENT_EMAIL` | Where the brief is sent |
| `CRON_SECRET` | Long random string; protects the cron route |
| `FX_USD_INR` | USD to INR rate used by code (default 84) |
| `NEXT_PUBLIC_SITE_URL` | Optional; the production domain is detected automatically |
| `GEMINI_FALLBACK_MODELS`, `GEMINI_MIN_INTERVAL_MS` | Optional Gemini tuning (see below) |

5. **Deploy.** Push to GitHub, import the repo in Vercel, add the variables, deploy. Then open `/runs` and press
   "Run pipeline now", or call the cron route once.

`.env` and `.env.local` are git-ignored. The database is only ever reached from server code.

### Gemini free-tier quotas

Free-tier Flash models allow only about 5 requests a minute and a small number of requests a day, and quotas are per
model. The code therefore batches 20 articles per call, spaces requests 12.5 seconds apart, stops immediately on a
daily-quota error, and falls back to the next Flash model in `GEMINI_FALLBACK_MODELS`. Only Gemini Flash models are
ever used.

## Pages

| Page | What it shows |
|---|---|
| `/` | The latest brief, with a status strip (deals, articles, sources healthy, last run) |
| `/briefs` | Archive of past briefs |
| `/deals` | Live deal log: search, filters, focus-only toggle, CSV export |
| `/config` | Edit sectors, stages, watchlist and portfolio. Changes apply to the next brief with no redeploy |
| `/runs` | Run the pipeline, send a test brief, backfill, per-source health and run history |
| `/about` | How it works, with the component map |

`/config` and `/runs` have **no password by design** (it was decided the pages should be public). To stop abuse,
runs have a 5-minute cooldown, emails a 5-minute cooldown, and the recipient address is read from the environment, not
the page, so nobody can redirect the brief. Anyone with the link can change the mandate, so treat the link as private.

## Data sources and limitations

Inc42, Entrackr, YourStory, ET Startups, ET Tech and three Google News searches. All were tested live. VCCircle and
the ET "funding" feed returned nothing and were dropped.

- **LinkedIn and Twitter/X are out of scope.** They cannot be scraped legally and have no open API.
- **RSS depth.** Most feeds hold only their latest 20 to 50 items, so history reaches back about a week. The
  "Backfill 4 weeks" button asks Google News for 28 days, but the publisher feeds cannot go that far. Week-on-week
  trends therefore need a few weeks of runs before they appear; until then the brief says "baseline week".
- **Headlines, not articles.** Google News links are redirects and publisher pages often block fetching, so the RSS
  title and description are the article text. Amounts that are not in that text appear as `undisclosed`.
- **Adjacency is only as good as the text.** Summaries say what a company raised, not always what it does, so
  adjacency flags are deliberately conservative and often empty.
- It reads announcements, so it can miss a deal no covered outlet reported.

## How to add a new source

Sources live in the `sources` table, so no deploy is needed. In the Neon SQL editor:

```sql
insert into sources (name, url) values ('My Source', 'https://example.com/feed.xml');
```

Any RSS or Atom URL works. Switch one off with `update sources set active = false where name = 'My Source';`.
The next run picks it up, and the brief's "Sources checked" line will show how many articles it returned.

## How this could become SaaS

Today there is one `config` row for one scout. To serve many users: add a `users` table and a `user_id` on
`config` (one mandate per user); store `relevance`, `watchlist_hit` and adjacency per user in a join table (the
extracted deals and statistics stay shared, so Gemini cost does not grow with users); run Stage 4 and Stages 5 to 6
once per user; add real authentication and Row Level Security in place of the open config page; and send from a
verified domain so briefs can reach any inbox.

## Project structure

```
app/            pages and API routes (cron, ingest, extract, verify, relevance, patterns, brief, deals, config)
lib/            pipeline stages, Gemini wrapper, verification (the Cut), number check, brief HTML, email
db/schema.sql   all tables, with row level security on
docs/           component map
vercel.json     the Monday cron
```
