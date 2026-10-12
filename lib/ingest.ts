import Parser from "rss-parser";
import { q } from "./db";
import { ensureSources, type Source } from "./sources";

// Cheap keyword filter so Gemini only sees articles that could be funding news.
const FUNDING_WORDS =
  /\b(raises?|raised|raising|funding|funds?|seed|series\s+[a-f]|pre-series|round|crore|lakh|million|billion|led by|backed|investment|invests?|invested|bags?|secures?|mops? up)\b|[$₹]\s?\d/i;

export type SourceResult = {
  name: string;
  articles: number; // items inside the time window
  added: number; // brand-new rows saved
  candidates: number; // look like funding news
  error: string | null;
};

export type IngestResult = {
  runId: number;
  days: number;
  sources: SourceResult[];
  totals: { articles: number; added: number; candidates: number };
};

function clean(html: string | undefined): string {
  return (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FundingPulse/1.0)" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function ingestSource(s: Source, days: number, since: number): Promise<SourceResult> {
  const result: SourceResult = { name: s.name, articles: 0, added: 0, candidates: 0, error: null };
  try {
    // Google News queries carry a "when:7d" window; widen it for backfills.
    const url = s.url.includes("news.google.com") ? s.url.replace(/when:\d+d/, `when:${days}d`) : s.url;
    const feed = await new Parser().parseString(await fetchFeed(url));

    const rows = feed.items
      .map((it) => {
        const published = it.isoDate ?? (it.pubDate ? new Date(it.pubDate).toISOString() : null);
        const title = clean(it.title);
        // RSS title + description is the article text (full pages often block fetching).
        const body = clean(it.contentSnippet || it.content || (it as unknown as { description?: string }).description);
        return { url: it.link ?? "", title, body: body || title, published };
      })
      .filter((r) => r.url && r.title && r.published && new Date(r.published).getTime() >= since);

    result.articles = rows.length;
    const flags = rows.map((r) => FUNDING_WORDS.test(`${r.title} ${r.body}`));
    result.candidates = flags.filter(Boolean).length;

    if (rows.length > 0) {
      const inserted = await q(
        `insert into articles (source, url, title, body_text, published_at, is_funding_candidate)
         select $1, u, t, b, p, c
         from unnest($2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::bool[]) as x(u, t, b, p, c)
         on conflict (url) do nothing
         returning id`,
        [s.name, rows.map((r) => r.url), rows.map((r) => r.title), rows.map((r) => r.body), rows.map((r) => r.published), flags]
      );
      result.added = inserted.length;
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  // Source health (Check 09): every run records how many items each source gave.
  await q(
    "update sources set last_fetched_at = now(), last_item_count = $1, last_error = $2 where id = $3",
    [result.articles, result.error, s.id]
  );
  return result;
}

// Stage 1: Ingest. Safe to re-run: duplicate article URLs are skipped.
export async function ingest(days = 7): Promise<IngestResult> {
  await ensureSources();
  const [run] = await q<{ id: number }>("insert into runs (status) values ('running') returning id");
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const sources = await q<Source>("select * from sources where active order by id");
    const results = await Promise.all(sources.map((s) => ingestSource(s, days, since)));
    const totals = {
      articles: results.reduce((n, r) => n + r.articles, 0),
      added: results.reduce((n, r) => n + r.added, 0),
      candidates: results.reduce((n, r) => n + r.candidates, 0),
    };
    const errors = results.filter((r) => r.error).map((r) => ({ source: r.name, error: r.error }));
    await q(
      "update runs set finished_at = now(), status = 'ingested', articles_fetched = $1, candidates = $2, errors = $3 where id = $4",
      [totals.articles, totals.candidates, JSON.stringify(errors), run.id]
    );
    return { runId: run.id, days, sources: results, totals };
  } catch (e) {
    await q("update runs set finished_at = now(), status = 'error', errors = $1 where id = $2", [
      JSON.stringify([{ error: e instanceof Error ? e.message : String(e) }]),
      run.id,
    ]);
    throw e;
  }
}
