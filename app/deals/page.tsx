import { q } from "@/lib/db";
import DealsTable, { type Deal } from "./DealsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deal log · Funding Pulse" };

export default async function Deals() {
  const deals = await q<Deal>(
    `select company_name, round_stage, amount_text, amount_usd_m, amount_inr_cr, verified_amount, lead_investor, sector,
            one_line_summary, source_urls, to_char(announced_week, 'YYYY-MM-DD') as week, relevance, watchlist_hit, adjacent_to
     from deals order by announced_week desc, amount_usd_m desc nulls last, company_name limit 1000`
  );
  return (
    <main>
      <p className="kicker">Live deal log</p>
      <h1>Every deal we’ve found.</h1>
      <p className="deck">The always-current replacement for the deal spreadsheet. Amounts appear only when the exact figure is in the source article. Numbered links open the articles.</p>
      <DealsTable deals={deals} />
    </main>
  );
}
