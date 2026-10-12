import { q } from "./db";

export type Deal = {
  company_name: string;
  round_stage: string;
  amount_text: string | null;
  amount_usd_m: string | null;
  amount_inr_cr: string | null;
  verified_amount: boolean;
  lead_investor: string | null;
  sector: string | null;
  one_line_summary: string | null;
  source_urls: string[];
  relevance: string;
  watchlist_hit: boolean;
  adjacent_to: string | null;
  adjacency_reason: string | null;
};

export type SourceRow = { name: string; last_item_count: number | null; last_error: string | null; last_fetched_at: string | null };

// Everything a brief shows, loaded once and used by both the web page and the email.
export async function loadBriefData(weekStart: string) {
  const deals = await q<Deal>(
    `select company_name, round_stage, amount_text, amount_usd_m, amount_inr_cr, verified_amount, lead_investor, sector,
            one_line_summary, source_urls, relevance, watchlist_hit, adjacent_to, adjacency_reason
     from deals where announced_week = $1::date
     order by amount_usd_m desc nulls last, company_name`,
    [weekStart]
  );
  const sources = await q<SourceRow>("select name, last_item_count, last_error, last_fetched_at from sources where active order by id");
  const urls = [...new Set(deals.flatMap((d) => d.source_urls))];
  const rows = urls.length ? await q<{ url: string; source: string }>("select url, source from articles where url = any($1::text[])", [urls]) : [];
  const outlet = new Map(rows.map((r) => [r.url, r.source.replace(/^Google News:.*/, "Google News")]));
  return { deals, sources, outlet };
}

// One link per outlet (the first article), with a count when several articles from that outlet covered it.
export function groupLinks(urls: string[], outlet: Map<string, string>): { name: string; url: string; n: number }[] {
  const groups = new Map<string, { name: string; url: string; n: number }>();
  for (const u of urls) {
    const name = outlet.get(u) ?? "Source";
    const g = groups.get(name);
    if (g) g.n++;
    else groups.set(name, { name, url: u, n: 1 });
  }
  return [...groups.values()];
}
