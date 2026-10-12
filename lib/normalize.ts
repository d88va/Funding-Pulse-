import { q, ensureSchema } from "./db";
import { ROUNDS, type RawDeal } from "./extract";
import { companyKey, mondayOf, verifyAmount, type Verification } from "./verify";

type ArticleRow = {
  id: number;
  url: string;
  title: string;
  body_text: string | null;
  published_at: string;
  extraction: RawDeal[] | null;
};

type DealRow = {
  id: number;
  round_stage: string;
  verified_amount: boolean;
  source_urls: string[];
  other_investors: string[];
  lead_investor: string | null;
  sector: string | null;
  city: string | null;
  one_line_summary: string | null;
};

export type VerifyResult = {
  articles: number;
  dealsBuilt: number;
  merged: number;
  verifiedAmounts: number;
  undisclosed: number;
  rejected: { company: string; claimed: string | null; reason: string; headline: string }[];
};

const clean = (s: string | null | undefined) => (s && s.trim() && s.trim().toLowerCase() !== "null" ? s.trim() : null);

// Stage 3: Verify + normalize + dedupe. Code only. Safe to re-run: handled articles are marked normalized,
// and the same deal arriving twice is merged instead of duplicated.
export async function verifyStage(): Promise<VerifyResult> {
  await ensureSchema();
  const articles = await q<ArticleRow>(
    `select id, url, title, body_text, published_at, extraction from articles
     where extraction is not null and not normalized order by published_at asc`
  );
  const result: VerifyResult = { articles: articles.length, dealsBuilt: 0, merged: 0, verifiedAmounts: 0, undisclosed: 0, rejected: [] };

  for (const a of articles) {
    const text = `${a.title} ${a.body_text ?? ""}`;
    const week = mondayOf(a.published_at);

    for (const d of a.extraction ?? []) {
      const name = clean(d.company_name);
      if (!name || d.not_a_funding_deal) continue;
      const key = companyKey(name);
      if (!key) continue;

      const v: Verification = verifyAmount(d.amount_text, text, d.amount_value);
      if (v.claimed && !v.ok) result.rejected.push({ company: name, claimed: v.claimed, reason: v.reason, headline: a.title });
      v.ok ? result.verifiedAmounts++ : result.undisclosed++;

      const round = d.round_stage && ROUNDS.includes(d.round_stage) ? d.round_stage : "Undisclosed";
      const others = (d.other_investors ?? []).map((s) => s.trim()).filter(Boolean);

      const existing = await q<DealRow>("select * from deals where company_key = $1 and announced_week = $2", [key, week]);
      const match =
        existing.find((e) => e.round_stage === round) ??
        (round === "Undisclosed" ? existing[0] : existing.find((e) => e.round_stage === "Undisclosed"));

      if (match) {
        // Same company, same week: it is the same deal reported by another outlet. Merge, keep the verified amount.
        const useNewAmount = v.ok && !match.verified_amount;
        const newRound = match.round_stage === "Undisclosed" && round !== "Undisclosed" ? round : match.round_stage;
        const roundTaken = newRound !== match.round_stage && existing.some((e) => e.round_stage === newRound);
        await q(
          `update deals set
             round_stage = $1,
             source_urls = (select array(select distinct unnest(source_urls || $2::text[]))),
             other_investors = (select array(select distinct unnest(other_investors || $3::text[]))),
             lead_investor = coalesce(lead_investor, $4),
             sector = case when sector is null or sector = 'Other' then coalesce($5, sector) else sector end,
             city = coalesce(city, $6),
             one_line_summary = coalesce(one_line_summary, $7)
           where id = $8`,
          [roundTaken ? match.round_stage : newRound, [a.url], others, clean(d.lead_investor), clean(d.sector), clean(d.city), clean(d.one_line_summary), match.id]
        );
        if (useNewAmount) {
          await q(
            `update deals set amount_text=$1, amount_value=$2, amount_unit=$3, currency=$4,
               amount_usd_m=$5, amount_inr_cr=$6, verified_amount=true where id=$7`,
            [v.claimed, v.parsed!.value, v.parsed!.unit, v.parsed!.currency, v.usdM, v.inrCr, match.id]
          );
        }
        result.merged++;
      } else {
        await q(
          `insert into deals (company_name, company_key, round_stage, amount_text, amount_value, amount_unit, currency,
             amount_usd_m, amount_inr_cr, lead_investor, other_investors, sector, city, one_line_summary,
             source_urls, announced_week, verified_amount)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           on conflict (company_key, round_stage, announced_week) do nothing`,
          [
            name, key, round,
            v.ok ? v.claimed : null,
            v.ok ? v.parsed!.value : null,
            v.ok ? v.parsed!.unit : null,
            v.ok ? v.parsed!.currency : null,
            v.ok ? v.usdM : null,
            v.ok ? v.inrCr : null,
            clean(d.lead_investor), others, clean(d.sector), clean(d.city), clean(d.one_line_summary),
            [a.url], week, v.ok,
          ]
        );
        result.dealsBuilt++;
      }
    }
    await q("update articles set normalized = true where id = $1", [a.id]);
  }

  const [{ n }] = await q<{ n: string }>("select count(*) as n from deals");
  await q(
    "update runs set deals_after_dedupe = $1, status = 'verified', finished_at = now() where id = (select id from runs order by started_at desc limit 1)",
    [Number(n)]
  );
  return result;
}
