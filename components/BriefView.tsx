import { q } from "@/lib/db";
import { loadBriefData, groupLinks, type Deal } from "@/lib/briefData";
import { weekLabel } from "@/lib/brief";
import type { Stats } from "@/lib/patterns";

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

function DealRow({ d, outlet }: { d: Deal; outlet: Map<string, string> }) {
  const verified = d.verified_amount && d.amount_inr_cr != null;
  const meta = [d.round_stage, d.sector, d.lead_investor ? `led by ${d.lead_investor}` : null].filter(Boolean).join(" · ");
  return (
    <div className="deal">
      <div className="deal-main">
        <div className="name">{d.company_name}</div>
        <div className="meta">{meta}</div>
        {d.one_line_summary && <div className="blurb">{d.one_line_summary}</div>}
        {d.watchlist_hit && <div className="flag">On your watchlist</div>}
        {d.adjacent_to && (
          <div className="flag">
            Possibly next to {d.adjacent_to.replace(/\s*\(.*?\)\s*/g, "")}: {d.adjacency_reason}{" "}
            <span className="quiet">(AI judgement from the article text. Check the source.)</span>
          </div>
        )}
        <div className="links">
          {groupLinks(d.source_urls, outlet).map((g, i) => (
            <span key={g.name}>
              {i > 0 && " · "}
              <a href={g.url} target="_blank" rel="noreferrer">{g.name}{g.n > 1 ? ` (${g.n})` : ""}</a>
            </span>
          ))}
        </div>
      </div>
      <div className="amt" title={verified ? `In the source: ${d.amount_text}` : "The article gives no amount"}>
        {verified ? (
          <>
            ₹{fmt(Number(d.amount_inr_cr))} cr
            <small>${fmt(Number(d.amount_usd_m))}M</small>
          </>
        ) : (
          <span className="quiet">Undisclosed</span>
        )}
      </div>
    </div>
  );
}

function Compact({ d }: { d: Deal }) {
  return (
    <div className="deal compact">
      <div className="deal-main">
        <span className="name">{d.company_name}</span> <span className="quiet">· {d.round_stage}{d.sector ? ` · ${d.sector}` : ""}</span>
      </div>
      <div className="amt">{d.verified_amount && d.amount_inr_cr != null ? `₹${fmt(Number(d.amount_inr_cr))} cr` : <span className="quiet">Undisclosed</span>}</div>
    </div>
  );
}

// The brief as a web page: the same data as the email, laid out for reading.
export default async function BriefView({ week, status }: { week: string; status?: string }) {
  const [row] = await q<{ stats: (Stats & { bullets: string[] }) | null; html: string }>(
    "select stats, html from briefs where week_start = $1::date",
    [week]
  );
  if (!row?.stats || !row.html) return null;
  const stats = row.stats;
  const { deals, sources, outlet } = await loadBriefData(week);

  const alerts = deals.filter((d) => d.watchlist_hit || d.adjacent_to);
  const focus = deals.filter((d) => d.relevance === "focus");
  const focusOnly = focus.filter((d) => !d.watchlist_hit && !d.adjacent_to); // alerted deals are shown once, above
  const rest = deals.filter((d) => d.relevance !== "focus");

  return (
    <article>
      <header className="issue">
        <p className="meta">Week of {weekLabel(week)}</p>
        <h1>{stats.total_deals} deals this week</h1>
        <p className="sum">₹{fmt(stats.total_disclosed_inr_cr)} cr disclosed. {stats.focus_deals} match your focus.</p>
        {status && <p className="meta">{status}</p>}
      </header>

      <section>
        <h2 className="accent">Needs your attention</h2>
        {alerts.length ? (
          <div className="rows">{alerts.map((d, i) => <DealRow key={i} d={d} outlet={outlet} />)}</div>
        ) : (
          <p className="quiet">No watchlist or adjacent activity this week.</p>
        )}
      </section>

      <section>
        <h2>Your focus · {focus.length}</h2>
        {focus.length > focusOnly.length && (
          <p className="meta">{focus.length - focusOnly.length} of these are in the alerts above.</p>
        )}
        {focusOnly.length ? (
          <div className="rows">{focusOnly.map((d, i) => <DealRow key={i} d={d} outlet={outlet} />)}</div>
        ) : focus.length ? null : (
          <p className="quiet">No deals matched your sectors and stages this week. Everything we found is below.</p>
        )}
      </section>

      <section>
        <h2>Patterns</h2>
        <ul className="plain">{(stats.bullets ?? []).map((b, i) => <li key={i}>{b}</li>)}</ul>
        <p className="meta">Counted in code. Every number is checked against the count.</p>
      </section>

      <section>
        <details>
          <summary>Everything else · {rest.length}</summary>
          <div className="rows">{rest.map((d, i) => <Compact key={i} d={d} />)}</div>
        </details>
        <p className="meta">Nothing is hidden: deals outside your focus are listed here.</p>
      </section>

      <section className="sources">
        <h2>Sources checked</h2>
        <p>
          {sources.map((s, i) => {
            const down = !!s.last_error || !s.last_fetched_at || s.last_item_count === 0;
            return (
              <span key={s.name} className={down ? "bad" : ""}>
                {i > 0 && " · "}
                {down && "⚠ "}{s.name} {s.last_error ? "failed" : s.last_fetched_at ? (s.last_item_count ?? 0) : "not checked"}
              </span>
            );
          })}
        </p>
      </section>
    </article>
  );
}
