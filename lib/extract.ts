import { Type, type Schema } from "@google/genai";
import { q, ensureSchema } from "./db";
import { geminiJSON, usage } from "./gemini";

export const ROUNDS = ["Pre-seed", "Seed", "Pre-Series A", "Series A", "Series B", "Series C+", "Debt", "Undisclosed"];

export type RawDeal = {
  article_id: number;
  not_a_funding_deal: boolean;
  company_name?: string | null;
  round_stage?: string | null;
  amount_text?: string | null;
  amount_value?: number | null;
  amount_unit?: string | null;
  currency?: string | null;
  lead_investor?: string | null;
  other_investors?: string[] | null;
  sector?: string | null;
  city?: string | null;
  one_line_summary?: string | null;
};

const str = { type: Type.STRING, nullable: true };
const schema: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          article_id: { type: Type.INTEGER },
          not_a_funding_deal: { type: Type.BOOLEAN },
          company_name: str,
          round_stage: { type: Type.STRING, nullable: true, enum: ROUNDS },
          amount_text: str,
          amount_value: { type: Type.NUMBER, nullable: true },
          amount_unit: str,
          currency: str,
          lead_investor: str,
          other_investors: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
          sector: str,
          city: str,
          one_line_summary: str,
        },
        required: ["article_id", "not_a_funding_deal"],
      },
    },
  },
  required: ["items"],
};

const BATCH = 9; // articles per Gemini call, to stay under free-tier rate limits
const CONCURRENCY = 3;

function systemPrompt(sectors: string[]): string {
  return `You extract startup funding deals from Indian news headlines and snippets.

Rules:
- Never guess. Use null for anything the text does not state.
- Indian startups only. If the company is not Indian, or the item is an acquisition, IPO, fund launch, layoff, or anything other than a startup raising money, return not_a_funding_deal = true.
- An article may list several deals (a funding roundup). Return one item per deal, each with the same article_id.
- amount_text must be copied character for character from the article text, for example "Rs 25 crore" or "$5 million". It must include the currency and the unit exactly as written. If the article does not state the amount, set it to null. Never rewrite, round or translate it.
- amount_value, amount_unit and currency describe that same span (value 25, unit "crore", currency "INR"). Use null if amount_text is null.
- round_stage must be one of: ${ROUNDS.join(", ")}. Use "Undisclosed" if the round is not stated.
- sector: choose one of ${sectors.join(", ")} if it fits the company, otherwise "Other".
- one_line_summary: one plain sentence of facts from the text. Do not add opinions, predictions or numbers that are not in the text.
- lead_investor: only if the text says who led. other_investors: other named investors, else an empty list.
- Return exactly one item with not_a_funding_deal = true for any article that has no deal.`;
}

function batchPrompt(rows: { id: number; title: string; body_text: string | null }[]): string {
  return rows
    .map((r) => {
      const body = (r.body_text ?? "").slice(0, 1500);
      return `[article_id ${r.id}]\nTITLE: ${r.title}\nTEXT: ${body === r.title ? "(same as title)" : body}`;
    })
    .join("\n\n");
}

export type ExtractResult = {
  processed: number;
  remaining: number;
  geminiCalls: number;
  dealsFound: number;
  errors: string[];
};

// Stage 2: Extract. Reads unprocessed funding candidates, asks Gemini for deal fields, and stores the raw
// answer on each article. Nothing here is trusted yet: stage 3 verifies every amount in code.
// Stops before the serverless time limit; call it again to continue (it only picks up unprocessed rows).
export async function extractStage(budgetMs = 230_000): Promise<ExtractResult> {
  await ensureSchema();
  const started = Date.now();
  const callsBefore = usage.calls;

  const [cfg] = await q<{ sectors: string[] }>("select sectors from config where id = 1");
  const system = systemPrompt(cfg?.sectors ?? []);

  const pending = await q<{ id: number; title: string; body_text: string | null }>(
    `select id, title, body_text from articles
     where is_funding_candidate and not processed
     order by published_at desc limit 400`
  );

  const batches: (typeof pending)[] = [];
  for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));

  let processed = 0;
  let dealsFound = 0;
  const errors: string[] = [];
  let next = 0;

  async function worker() {
    while (next < batches.length && Date.now() - started < budgetMs) {
      const rows = batches[next++];
      try {
        const out = await geminiJSON<{ items: RawDeal[] }>(system, batchPrompt(rows), schema);
        const ids = new Set(rows.map((r) => r.id));
        for (const r of rows) {
          const deals = (out.items ?? []).filter((it) => it.article_id === r.id && ids.has(it.article_id));
          const real = deals.filter((d) => !d.not_a_funding_deal && d.company_name);
          dealsFound += real.length;
          await q("update articles set extraction = $1, processed = true where id = $2", [JSON.stringify(real), r.id]);
          processed++;
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e)); // rows stay unprocessed and are retried next call
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const [{ n }] = await q<{ n: string }>(
    "select count(*) as n from articles where is_funding_candidate and not processed"
  );
  const geminiCalls = usage.calls - callsBefore;
  await q(
    `update runs set gemini_calls = gemini_calls + $1, deals_extracted = deals_extracted + $2, status = $3
     where id = (select id from runs order by started_at desc limit 1)`,
    [geminiCalls, dealsFound, Number(n) === 0 ? "extracted" : "extracting"]
  );
  return { processed, remaining: Number(n), geminiCalls, dealsFound, errors: errors.slice(0, 5) };
}
