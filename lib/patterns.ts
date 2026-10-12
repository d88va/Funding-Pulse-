import { Type, type Schema } from "@google/genai";
import { q, ensureSchema } from "./db";
import { geminiJSON, usage } from "./gemini";
import { checkNumbers } from "./numbercheck";
import { mondayOf } from "./verify";

type DealRow = {
  company_name: string;
  round_stage: string;
  amount_usd_m: string | null;
  amount_inr_cr: string | null;
  verified_amount: boolean;
  lead_investor: string | null;
  other_investors: string[];
  sector: string | null;
  week: string;
  relevance: string;
  watchlist_hit: boolean;
  adjacent_to: string | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (s: string | null) => (s == null ? 0 : Number(s));

// The week a Monday brief reports on: the week that contains yesterday. Run on a Monday it is the week
// that just ended. Run midweek (a demo) it is the current week so far.
export function reportWeek(now = new Date()): string {
  return mondayOf(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

const addDays = (iso: string, d: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + d * 86400000).toISOString().slice(0, 10);

export type Stats = ReturnType<typeof buildStats>;

// Every number in the brief's pattern section is counted here, in code.
export function buildStats(weekStart: string, rows: DealRow[]) {
  const thisWeek = rows.filter((d) => d.week === weekStart);
  const prior = rows.filter((d) => d.week < weekStart);
  const priorWeeks = [...new Set(prior.map((d) => d.week))].sort().slice(-4);
  const prev3 = priorWeeks.slice(-3);
  const baseline = priorWeeks.length === 0;

  const disclosed = thisWeek.filter((d) => d.verified_amount);
  const sectors = [...new Set(thisWeek.map((d) => d.sector ?? "Other"))];

  const deals_by_sector = sectors
    .map((s) => {
      const ds = thisWeek.filter((d) => (d.sector ?? "Other") === s);
      return { sector: s, deals: ds.length, capital_usd_m: r1(ds.filter((d) => d.verified_amount).reduce((n, d) => n + num(d.amount_usd_m), 0)) };
    })
    .sort((a, b) => b.deals - a.deals);

  const stageNames = [...new Set(thisWeek.map((d) => d.round_stage))];
  const deals_by_stage = stageNames
    .map((s) => ({ stage: s, deals: thisWeek.filter((d) => d.round_stage === s).length }))
    .sort((a, b) => b.deals - a.deals);

  // Week-on-week: this week against the average of up to 3 previous weeks. No history means "baseline week".
  const sector_change = sectors.map((s) => {
    const now = thisWeek.filter((d) => (d.sector ?? "Other") === s).length;
    if (baseline) return { sector: s, this_week: now, prev_avg: null, change_pct: null };
    const total = prior.filter((d) => prev3.includes(d.week) && (d.sector ?? "Other") === s).length;
    const avg = total / prev3.length;
    return { sector: s, this_week: now, prev_avg: r1(avg), change_pct: avg > 0 ? Math.round(((now - avg) / avg) * 100) : null };
  });

  const top5_largest = [...disclosed]
    .sort((a, b) => num(b.amount_usd_m) - num(a.amount_usd_m))
    .slice(0, 5)
    .map((d) => ({ company: d.company_name, stage: d.round_stage, amount_inr_cr: r1(num(d.amount_inr_cr)), amount_usd_m: r1(num(d.amount_usd_m)) }));

  // New investors: lead investors this week that did not lead anything in the previous 4 weeks.
  const seenBefore = new Set(prior.filter((d) => priorWeeks.includes(d.week) && d.lead_investor).map((d) => d.lead_investor!.toLowerCase()));
  const leads = [...new Set(thisWeek.map((d) => d.lead_investor).filter((x): x is string => !!x))];
  const new_lead_investors = { baseline, investors: baseline ? [] : leads.filter((l) => !seenBefore.has(l.toLowerCase())) };

  const tally = new Map<string, number>();
  for (const d of thisWeek) for (const inv of [d.lead_investor, ...d.other_investors]) if (inv) tally.set(inv, (tally.get(inv) ?? 0) + 1);
  const most_active_investors = [...tally.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([investor, deals]) => ({ investor, deals }));

  return {
    week_start: weekStart,
    total_deals: thisWeek.length,
    deals_with_disclosed_amount: disclosed.length,
    total_disclosed_inr_cr: r1(disclosed.reduce((n, d) => n + num(d.amount_inr_cr), 0)),
    total_disclosed_usd_m: r1(disclosed.reduce((n, d) => n + num(d.amount_usd_m), 0)),
    focus_deals: thisWeek.filter((d) => d.relevance === "focus").length,
    watchlist_hits: thisWeek.filter((d) => d.watchlist_hit).length,
    adjacent_deals: thisWeek.filter((d) => d.adjacent_to).length,
    deals_by_sector,
    deals_by_stage,
    sector_change_vs_prev_weeks: { baseline, history_weeks: prev3.length, sectors: sector_change },
    top5_largest,
    new_lead_investors,
    most_active_investors,
  };
}

// Plain-sentence fallback, built only from the stats. Used whenever Gemini's text fails the number check.
export function templateBullets(s: Stats): string[] {
  const out: string[] = [];
  out.push(
    `${s.total_deals} deals were announced this week; ${s.deals_with_disclosed_amount} disclosed an amount, totalling ₹${s.total_disclosed_inr_cr} crore ($${s.total_disclosed_usd_m} million).`
  );
  const top = s.deals_by_sector[0];
  if (top) out.push(`${top.sector} had the most deals with ${top.deals}.`);
  if (s.sector_change_vs_prev_weeks.baseline) out.push("This is a baseline week, so there is no week-on-week comparison yet.");
  else {
    const mover = s.sector_change_vs_prev_weeks.sectors.filter((x) => x.change_pct != null).sort((a, b) => Math.abs(b.change_pct!) - Math.abs(a.change_pct!))[0];
    if (mover) out.push(`${mover.sector} moved ${mover.change_pct}% against its recent weekly average of ${mover.prev_avg}.`);
  }
  const big = s.top5_largest[0];
  if (big) out.push(`The largest disclosed round was ${big.company} at ₹${big.amount_inr_cr} crore ($${big.amount_usd_m} million).`);
  return out.slice(0, 4);
}

const bulletSchema: Schema = {
  type: Type.OBJECT,
  properties: { bullets: { type: Type.ARRAY, items: { type: Type.STRING } } },
  required: ["bullets"],
};

const NARRATE_SYSTEM = `You turn a JSON of already-counted funding statistics into 3 or 4 short, plain bullet sentences for a venture scout.
Rules:
- Use only numbers that appear in the JSON, written exactly as they appear. Do not round, add, subtract, compare or compute any number.
- Write numbers as digits. Do not mention dates. Do not use percentages unless a change_pct is in the JSON.
- Describe patterns only. No advice, no predictions, no recommendations about who to contact or what to tell anyone.
- If the JSON says baseline is true, say there is no week-on-week comparison yet.
- One sentence per bullet, under 30 words.`;

export type PatternResult = {
  weekStart: string;
  stats: Stats;
  bullets: string[];
  source: "gemini" | "template";
  rejected: { text: string; bad: string[] }[];
};

// Stage 5: code counts, Gemini narrates, code checks every number in the narration.
export async function patternsStage(): Promise<PatternResult> {
  await ensureSchema();
  const callsBefore = usage.calls;
  const weekStart = reportWeek();
  const rows = await q<DealRow>(
    `select company_name, round_stage, amount_usd_m, amount_inr_cr, verified_amount, lead_investor, other_investors,
            sector, to_char(announced_week, 'YYYY-MM-DD') as week, relevance, watchlist_hit, adjacent_to
     from deals where announced_week between $1::date - 28 and $1::date`,
    [weekStart]
  );
  const stats = buildStats(weekStart, rows);

  let bullets: string[] = [];
  let source: "gemini" | "template" = "template";
  const rejected: { text: string; bad: string[] }[] = [];
  if (stats.total_deals > 0) {
    try {
      const out = await geminiJSON<{ bullets: string[] }>(NARRATE_SYSTEM, JSON.stringify(stats), bulletSchema);
      const cand = (out.bullets ?? []).map((b) => b.trim()).filter(Boolean);
      const checks = cand.map((b) => ({ text: b, ...checkNumbers(b, stats) }));
      checks.filter((c) => !c.ok).forEach((c) => rejected.push({ text: c.text, bad: c.bad }));
      // All-or-nothing: one invented number and Gemini's whole text is discarded.
      if (cand.length >= 3 && cand.length <= 4 && checks.every((c) => c.ok)) {
        bullets = cand;
        source = "gemini";
      }
    } catch {
      /* fall through to the template */
    }
    if (source === "template") bullets = templateBullets(stats);
  }

  const payload = JSON.stringify({ ...stats, bullets, bullets_source: source });
  await q(
    `insert into briefs (week_start, html, stats) values ($1, '', $2::jsonb)
     on conflict (week_start) do update set stats = excluded.stats`,
    [weekStart, payload]
  );
  await q(
    "update runs set gemini_calls = gemini_calls + $1, status = 'patterns' where id = (select id from runs order by started_at desc limit 1)",
    [usage.calls - callsBefore]
  );
  return { weekStart, stats, bullets, source, rejected };
}
