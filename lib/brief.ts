import { q, ensureSchema } from "./db";
import { loadConfig } from "./config";
import { patternsStage, reportWeek, type Stats } from "./patterns";

// Stage 6: assemble the brief. Email-safe HTML: tables, inline styles, no scripts, 600px wide, reads on a phone.
// The brief reports. It never recommends who to contact or what to tell anyone (the human gate).

type Deal = {
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

type SourceRow = { name: string; last_item_count: number | null; last_error: string | null; last_fetched_at: string | null };

const INK = "#1c1a17", MUTED = "#6f6a60", LINE = "#e2dbcc", ACCENT = "#b4441f", BAD = "#c0261c", PAPER = "#f8f4ec";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

export function weekLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function amount(d: Deal): string {
  if (!d.verified_amount || d.amount_inr_cr == null || d.amount_usd_m == null) return "undisclosed";
  return `${esc(d.amount_text)} &nbsp;<span style="color:${MUTED}">≈ ₹${fmt(Number(d.amount_inr_cr))} cr · $${fmt(Number(d.amount_usd_m))}M</span>`;
}

function links(d: Deal, outlet: Map<string, string>): string {
  return d.source_urls
    .map((u) => `<a href="${esc(u)}" style="color:${ACCENT};text-decoration:underline">${esc(outlet.get(u) ?? "Source")}</a>`)
    .join(" &middot; ");
}

function section(title: string, body: string, note = ""): string {
  return `<tr><td style="padding:28px 24px 0 24px">
    <div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${INK};padding-bottom:6px;border-bottom:1px solid ${INK}">${title}</div>
    ${note ? `<div style="font-family:${SANS};font-size:12px;color:${MUTED};padding-top:6px">${note}</div>` : ""}
    <div style="padding-top:8px">${body}</div></td></tr>`;
}

// One deal as a stacked row: it stays readable on a phone, unlike a wide seven-column table.
function dealRow(d: Deal, outlet: Map<string, string>, extra = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${LINE}"><tr><td style="padding:12px 0">
    <div style="font-family:${SANS};font-size:15px;color:${INK}"><b>${esc(d.company_name)}</b>
      <span style="color:${MUTED}"> &nbsp;${esc(d.round_stage)}${d.sector ? " · " + esc(d.sector) : ""}</span></div>
    <div style="font-family:${SANS};font-size:14px;color:${INK};padding-top:2px">${amount(d)}${d.lead_investor ? `<span style="color:${MUTED}"> · led by ${esc(d.lead_investor)}</span>` : ""}</div>
    ${d.one_line_summary ? `<div style="font-family:${SANS};font-size:13px;color:${MUTED};padding-top:3px">${esc(d.one_line_summary)}</div>` : ""}
    ${extra}
    <div style="font-family:${SANS};font-size:12px;padding-top:4px">${links(d, outlet)}</div>
  </td></tr></table>`;
}

function compactRow(d: Deal, outlet: Map<string, string>): string {
  const amt = d.verified_amount && d.amount_inr_cr != null ? `₹${fmt(Number(d.amount_inr_cr))} cr` : "undisclosed";
  return `<div style="font-family:${SANS};font-size:13px;color:${INK};padding:7px 0;border-bottom:1px solid ${LINE}">
    <b>${esc(d.company_name)}</b> <span style="color:${MUTED}">· ${esc(d.round_stage)} · ${amt}${d.sector ? " · " + esc(d.sector) : ""}</span>
    <span style="font-size:12px"> &nbsp;${links(d, outlet)}</span></div>`;
}

export type BuiltBrief = { weekStart: string; subject: string; html: string; stats: Stats };

export async function buildBrief(): Promise<BuiltBrief> {
  await ensureSchema();
  const weekStart = reportWeek();
  const cfg = await loadConfig();

  // Make sure stage 5 has run for this week; it stores the stats and the number-checked bullets.
  let [row] = await q<{ stats: (Stats & { bullets: string[]; bullets_source: string }) | null }>(
    "select stats from briefs where week_start = $1::date",
    [weekStart]
  );
  if (!row?.stats) {
    await patternsStage();
    [row] = await q("select stats from briefs where week_start = $1::date", [weekStart]);
  }
  const stats = row.stats!;

  const deals = await q<Deal>(
    `select company_name, round_stage, amount_text, amount_usd_m, amount_inr_cr, verified_amount, lead_investor, sector,
            one_line_summary, source_urls, relevance, watchlist_hit, adjacent_to, adjacency_reason
     from deals where announced_week = $1::date
     order by amount_usd_m desc nulls last, company_name`,
    [weekStart]
  );
  const sources = await q<SourceRow>("select name, last_item_count, last_error, last_fetched_at from sources where active order by id");

  const urls = [...new Set(deals.flatMap((d) => d.source_urls))];
  const outletRows = urls.length ? await q<{ url: string; source: string }>("select url, source from articles where url = any($1::text[])", [urls]) : [];
  const outlet = new Map(outletRows.map((r) => [r.url, r.source.replace(/^Google News:.*/, "Google News")]));

  const focus = deals.filter((d) => d.relevance === "focus");
  const rest = deals.filter((d) => d.relevance !== "focus");
  const alerts = deals.filter((d) => d.watchlist_hit || d.adjacent_to);

  const headline = `${stats.total_deals} deals · ₹${fmt(stats.total_disclosed_inr_cr)} cr disclosed · ${stats.focus_deals} in your focus areas`;

  const alertsBody = alerts.length
    ? alerts
        .map((d) => {
          const why = [
            d.watchlist_hit ? `<div style="font-family:${SANS};font-size:13px;color:${ACCENT};padding-top:3px"><b>On your watchlist.</b></div>` : "",
            d.adjacent_to
              ? `<div style="font-family:${SANS};font-size:13px;color:${ACCENT};padding-top:3px"><b>Possibly next to ${esc(d.adjacent_to.replace(/\s*\(.*?\)\s*/g, ""))}:</b> ${esc(d.adjacency_reason)} <span style="color:${MUTED}">(AI judgement from the article text. Check the source.)</span></div>`
              : "",
          ].join("");
          return dealRow(d, outlet, why);
        })
        .join("")
    : `<div style="font-family:${SANS};font-size:14px;color:${MUTED};padding:6px 0">No watchlist or adjacent activity this week.</div>`;

  const focusBody = focus.length
    ? focus.map((d) => dealRow(d, outlet)).join("")
    : `<div style="font-family:${SANS};font-size:14px;color:${MUTED};padding:6px 0">No deals matched your sectors and stages this week. Everything we found is listed below.</div>`;

  const bullets = (stats.bullets ?? [])
    .map((b) => `<li style="font-family:${SANS};font-size:14px;color:${INK};padding:3px 0">${esc(b)}</li>`)
    .join("");

  const sourcesBody = sources
    .map((s) => {
      const down = !!s.last_error || !s.last_fetched_at || s.last_item_count === 0;
      const text = s.last_error ? `failed (${esc(s.last_error.slice(0, 60))})` : s.last_fetched_at ? `${s.last_item_count ?? 0} articles` : "not checked";
      return `<div style="font-family:${SANS};font-size:13px;padding:2px 0;color:${down ? BAD : INK}">${down ? "⚠ " : ""}<b>${esc(s.name)}</b> &mdash; ${text}</div>`;
    })
    .join("");

  // NEXT_PUBLIC_SITE_URL if set, otherwise the production domain Vercel provides automatically.
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : "")).replace(/\/$/, "");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Funding Pulse</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${PAPER}">
  <tr><td style="padding:22px 24px 0 24px"><div style="border-top:4px solid ${INK}"></div>
    <div style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${ACCENT};padding-top:18px">Indian startup funding</div>
    <div style="font-family:${SERIF};font-size:30px;line-height:1.15;color:${INK};padding-top:6px">Funding Pulse &mdash; week of ${weekLabel(weekStart)}</div>
    <div style="font-family:${SERIF};font-size:17px;color:${MUTED};padding-top:10px">${esc(headline)}</div></td></tr>
  ${section("⚠ Watchlist &amp; portfolio alerts", alertsBody)}
  ${section("Your focus deals", focusBody, `Sectors: ${esc(cfg.sectors.join(", "))} · Stages: ${esc(cfg.stages.join(", "))}`)}
  ${section("Patterns this week", `<ul style="margin:0;padding-left:20px">${bullets}</ul>`, "Counted in code. The sentences are checked so every number comes from the count.")}
  ${section(`Rest of the week (${rest.length})`, rest.length ? rest.map((d) => compactRow(d, outlet)).join("") : `<div style="font-family:${SANS};font-size:14px;color:${MUTED}">Nothing else this week.</div>`, "Nothing is hidden. Deals outside your focus areas are listed here.")}
  ${section("Sources checked this week", sourcesBody)}
  <tr><td style="padding:28px 24px 36px 24px"><div style="border-top:1px solid ${LINE};padding-top:14px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED}">
    Amounts are taken from source articles; trends are counted, not estimated. This brief reports; it does not recommend who to contact.<br>
    ${site ? `Edit your focus areas: <a href="${esc(site)}/config" style="color:${ACCENT}">${esc(site)}/config</a>` : ""}</div></td></tr>
</table></td></tr></table></body></html>`;

  const subject = `Funding Pulse — week of ${weekLabel(weekStart)}: ${stats.total_deals} deals, ${stats.focus_deals} in your focus`;
  await q("update briefs set html = $1 where week_start = $2::date", [html, weekStart]);
  return { weekStart, subject, html, stats };
}
