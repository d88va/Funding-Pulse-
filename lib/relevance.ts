import { Type, type Schema } from "@google/genai";
import { q, ensureSchema } from "./db";
import { loadConfig, type PortfolioCompany } from "./config";
import { geminiJSON, usage, QuotaError } from "./gemini";
import { companyKey } from "./verify";

// Fuzzy, case-insensitive: "Zepto" matches "Zepto Pvt Ltd". Done in code, never by AI.
export function isWatchlistHit(company: string, watchlist: string[]): boolean {
  const key = companyKey(company);
  if (!key) return false;
  return watchlist.some((w) => {
    const wk = companyKey(w);
    if (!wk || wk.startsWith("replaceme")) return false; // untouched placeholder slots
    return key === wk || (Math.min(key.length, wk.length) >= 5 && (key.startsWith(wk) || wk.startsWith(key)));
  });
}

const adjacencySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          deal_id: { type: Type.INTEGER },
          adjacent_to: { type: Type.STRING, nullable: true },
          reason: { type: Type.STRING, nullable: true },
        },
        required: ["deal_id"],
      },
    },
  },
  required: ["items"],
};

function adjacencySystem(portfolio: PortfolioCompany[]): string {
  return `You compare newly funded Indian startups with an investor's portfolio companies.

Portfolio:
${portfolio.map((p) => `- ${p.name}: ${p.description}`).join("\n")}

For each deal, decide whether the funded company directly competes with, or sits right next to, one portfolio company:
it must serve the same customers AND solve the same problem, or be a clear substitute.
Strict rules:
- Judge ONLY from the summary text given, or from facts about the company you are certain of. If the summary does not say what the company does and you are not certain, adjacent_to = null.
- Never infer what a company does from the names of its investors, its sector label, or its funding round.
- A shared sector, or a loosely related industry (for example EV charging versus solar financing), is NOT adjacency.
- Being wrong is worse than missing one. Most deals should have adjacent_to = null.
- adjacent_to: the exact portfolio company name, or null.
- reason: one plain factual sentence saying why, only when adjacent_to is set. No numbers, no advice, no suggestion to contact anyone.
Return one item per deal_id.`;
}

// "StockSathi (sample)" and "StockSathi" are the same portfolio company; Gemini often drops the bracket.
const plain = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "");

function matchPortfolio(answer: string | null | undefined, portfolio: PortfolioCompany[]): string | null {
  const a = plain(answer ?? "");
  if (!a) return null;
  const hit = portfolio.find((p) => {
    const n = plain(p.name);
    return n === a || (Math.min(n.length, a.length) >= 5 && (n.startsWith(a) || a.startsWith(n)));
  });
  return hit ? hit.name : null;
}

export type RelevanceResult = {
  deals: number;
  focus: number;
  watchlistHits: number;
  adjacencyChecked: number;
  adjacent: number;
  unmatched: string[]; // Gemini named something that is not in the portfolio list; shown, never saved
  geminiCalls: number;
  errors: string[];
};

const CHUNK = 60;

// Stage 4: Relevance + watchlist (code) and adjacency (Gemini, one call per ~60 new deals).
// Focus and watchlist are recomputed from the live config every run, so config edits take effect immediately.
export async function relevanceStage(opts: { redo?: boolean } = {}): Promise<RelevanceResult> {
  await ensureSchema();
  const cfg = await loadConfig();
  const callsBefore = usage.calls;
  const errors: string[] = [];
  const unmatched: string[] = [];

  if (opts.redo) await q("update deals set adjacency_checked = false, adjacent_to = null, adjacency_reason = null");

  const deals = await q<{ id: number; company_name: string; sector: string | null; round_stage: string }>(
    "select id, company_name, sector, round_stage from deals"
  );

  const sectors = cfg.sectors.map((s) => s.toLowerCase());
  const stages = cfg.stages.map((s) => s.toLowerCase());
  const rel = deals.map((d) => ({
    id: d.id,
    focus: !!d.sector && sectors.includes(d.sector.toLowerCase()) && stages.includes(d.round_stage.toLowerCase()),
    watch: isWatchlistHit(d.company_name, cfg.watchlist),
  }));
  if (rel.length > 0) {
    await q(
      `update deals d set relevance = case when x.f then 'focus' else 'other' end, watchlist_hit = x.w
       from unnest($1::int[], $2::bool[], $3::bool[]) as x(id, f, w) where d.id = x.id`,
      [rel.map((r) => r.id), rel.map((r) => r.focus), rel.map((r) => r.watch)]
    );
  }

  // Adjacency: only deals not yet judged.
  const todo = await q<{ id: number; company_name: string; sector: string | null; one_line_summary: string | null }>(
    "select id, company_name, sector, one_line_summary from deals where not adjacency_checked order by id"
  );
  let checked = 0;
  if (cfg.portfolio.length === 0 && todo.length > 0) {
    await q("update deals set adjacency_checked = true where not adjacency_checked");
    checked = todo.length;
  } else {
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      try {
        const prompt = chunk
          .map((d) => `[deal_id ${d.id}] ${d.company_name} (${d.sector ?? "unknown sector"}): ${d.one_line_summary ?? "no summary"}`)
          .join("\n");
        const out = await geminiJSON<{ items: { deal_id: number; adjacent_to?: string | null; reason?: string | null }[] }>(
          adjacencySystem(cfg.portfolio),
          prompt,
          adjacencySchema
        );
        const byId = new Map((out.items ?? []).map((it) => [it.deal_id, it]));
        const rows = chunk.map((d) => {
          const it = byId.get(d.id);
          const match = matchPortfolio(it?.adjacent_to, cfg.portfolio); // must be a real portfolio company
          if (it?.adjacent_to && !match) unmatched.push(`${d.company_name} -> ${it.adjacent_to}`);
          return { id: d.id, adj: match, why: match ? (it?.reason ?? "").trim() || null : null };
        });
        await q(
          `update deals d set adjacent_to = x.a, adjacency_reason = x.r, adjacency_checked = true
           from unnest($1::int[], $2::text[], $3::text[]) as x(id, a, r) where d.id = x.id`,
          [rows.map((r) => r.id), rows.map((r) => r.adj), rows.map((r) => r.why)]
        );
        checked += rows.length;
      } catch (e) {
        errors.push(e instanceof Error ? e.message.slice(0, 300) : String(e));
        if (e instanceof QuotaError) break;
      }
    }
  }

  const [t] = await q<{ adjacent: string }>("select count(*) filter (where adjacent_to is not null) as adjacent from deals");
  const geminiCalls = usage.calls - callsBefore;
  await q(
    "update runs set gemini_calls = gemini_calls + $1, status = 'relevance' where id = (select id from runs order by started_at desc limit 1)",
    [geminiCalls]
  );
  return {
    deals: deals.length,
    focus: rel.filter((r) => r.focus).length,
    watchlistHits: rel.filter((r) => r.watch).length,
    adjacencyChecked: checked,
    adjacent: Number(t.adjacent),
    unmatched,
    geminiCalls,
    errors,
  };
}
