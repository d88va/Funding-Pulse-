import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

type Deal = {
  company_name: string;
  round_stage: string;
  amount_text: string | null;
  amount_usd_m: string | null;
  amount_inr_cr: string | null;
  verified_amount: boolean;
  lead_investor: string | null;
  sector: string | null;
  source_urls: string[];
  announced_week: string | Date;
};

function amount(d: Deal): string {
  if (!d.verified_amount || d.amount_inr_cr == null) return "undisclosed";
  return `${d.amount_text} (≈ ₹${Number(d.amount_inr_cr)} cr · $${Number(d.amount_usd_m)}M)`;
}

export default async function Deals() {
  const deals = await q<Deal>(
    "select * from deals order by announced_week desc, amount_usd_m desc nulls last, company_name limit 300"
  );
  return (
    <main>
      <p className="kicker">Live deal log</p>
      <h1>Every deal we’ve found.</h1>
      <p className="lede">{deals.length} deals. Amounts appear only when the exact figure is in the source article.</p>
      {deals.length === 0 ? (
        <div className="empty">No deals yet. Run the pipeline from the Runs page.</div>
      ) : (
        <table>
          <thead>
            <tr><th>Company</th><th>Stage</th><th>Amount</th><th>Lead</th><th>Sector</th><th>Source</th></tr>
          </thead>
          <tbody>
            {deals.map((d, i) => (
              <tr key={i}>
                <td><b>{d.company_name}</b></td>
                <td>{d.round_stage}</td>
                <td>{amount(d)}</td>
                <td>{d.lead_investor ?? "–"}</td>
                <td>{d.sector ?? "–"}</td>
                <td>
                  {d.source_urls.map((u, j) => (
                    <a key={j} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>{j + 1}</a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
