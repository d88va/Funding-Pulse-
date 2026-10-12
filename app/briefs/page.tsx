import Link from "next/link";
import { q } from "@/lib/db";
import { weekLabel } from "@/lib/brief";
import { fmtIST } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Past briefs · Funding Pulse" };

type Row = { week: string; stats: { total_deals?: number; focus_deals?: number } | null; sent_at: string | null; email_status: string | null; has_html: boolean };

export default async function Briefs() {
  const rows = await q<Row>(
    `select to_char(week_start,'YYYY-MM-DD') as week, stats, sent_at, email_status, html <> '' as has_html
     from briefs order by week_start desc`
  );
  return (
    <main>
      <p className="kicker">Archive</p>
      <h1>Past briefs.</h1>
      <p className="deck">Every weekly brief, exactly as it was built.</p>
      {rows.filter((r) => r.has_html).length === 0 ? (
        <div className="empty">No briefs yet. Run the pipeline from the Runs page.</div>
      ) : (
        <div className="list">
          {rows.filter((r) => r.has_html).map((r) => (
            <Link key={r.week} href={`/briefs/${r.week}`} className="row">
              <span>
                <b style={{ fontFamily: "var(--serif)", fontSize: 19 }}>Week of {weekLabel(r.week)}</b>
                <div className="hint" style={{ margin: 0 }}>{r.stats?.total_deals ?? 0} deals · {r.stats?.focus_deals ?? 0} in focus</div>
              </span>
              <span className="hint" style={{ margin: 0, textAlign: "right" }}>
                {r.sent_at ? `Emailed ${fmtIST(r.sent_at)}` : "Not emailed"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
