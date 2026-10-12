# Startup Funding Pulse

An AI-assisted weekly digest of Indian startup funding for a venture scout. Every Monday it pulls the
week's funding news from live feeds, extracts the deals, counts the patterns in code, and sends a brief.

> Status: work in progress. Built in phases; see the git history.

## Principles

- **The Cut (Check 06):** numbers never come from the AI. Gemini extracts, code verifies each amount
  against the source text, converts currencies, and computes all statistics.
- **Human gate (Check 07):** the brief reports. It never recommends who to contact or what to tell LPs.
- **Every deal links to its source.**
- **Source health is visible:** the brief shows how many articles each source returned; zeros are flagged.

## Architecture (matches `docs/Funding_Pulse_Component_Map.jpg`)

| Component | Role |
|---|---|
| Next.js on Vercel | App, pages, pipeline stages, cron entry point |
| Gemini Flash (`GEMINI_MODEL`) | Extracts deal fields, flags portfolio adjacency, narrates code-computed stats |
| RSS + Google News | Live funding news |
| Neon Postgres | Config, articles, deals, briefs, run logs |
| Resend | Sends the Monday brief |

## Setup

1. Create a Neon project and run `db/schema.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and fill it in.
3. Deploy on Vercel and add the same variables in Project Settings.

## Data sources and limits

Inc42, Entrackr, YourStory, ET Startups, ET Tech and three Google News searches (tested live). VCCircle had
no working feed. **LinkedIn and Twitter/X are out of scope:** they cannot be scraped legally and have no open
API. Most RSS feeds only hold their latest 20-50 items, so deep backfills rely on Google News.
