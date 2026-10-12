"use client";

import { useMemo, useState } from "react";

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
  week: string;
  relevance: string;
  watchlist_hit: boolean;
  adjacent_to: string | null;
};

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const amountOf = (d: Deal) => (d.verified_amount && d.amount_inr_cr != null ? `${d.amount_text} (≈ ₹${fmt(Number(d.amount_inr_cr))} cr · $${fmt(Number(d.amount_usd_m))}M)` : "undisclosed");

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function DealsTable({ deals }: { deals: Deal[] }) {
  const [text, setText] = useState("");
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [week, setWeek] = useState("");
  const [focusOnly, setFocusOnly] = useState(false);

  const opt = (f: (d: Deal) => string | null) => [...new Set(deals.map(f).filter((x): x is string => !!x))].sort();
  const sectors = useMemo(() => opt((d) => d.sector), [deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const stages = useMemo(() => opt((d) => d.round_stage), [deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const weeks = useMemo(() => opt((d) => d.week).reverse(), [deals]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = deals.filter((d) => {
    if (sector && d.sector !== sector) return false;
    if (stage && d.round_stage !== stage) return false;
    if (week && d.week !== week) return false;
    if (focusOnly && d.relevance !== "focus") return false;
    if (text) {
      const hay = `${d.company_name} ${d.lead_investor ?? ""} ${d.one_line_summary ?? ""} ${d.sector ?? ""}`.toLowerCase();
      if (!hay.includes(text.toLowerCase())) return false;
    }
    return true;
  });

  function exportCsv() {
    const head = ["Company", "Round", "Amount (as in source)", "INR crore", "USD million", "Amount verified", "Lead investor", "Sector", "Week of", "Focus", "Watchlist", "Adjacent to", "Summary", "Sources"];
    const rows = shown.map((d) => [
      d.company_name, d.round_stage, d.verified_amount ? d.amount_text ?? "" : "undisclosed", d.amount_inr_cr ?? "", d.amount_usd_m ?? "",
      d.verified_amount ? "yes" : "no", d.lead_investor ?? "", d.sector ?? "", d.week, d.relevance === "focus" ? "yes" : "no",
      d.watchlist_hit ? "yes" : "no", d.adjacent_to ?? "", d.one_line_summary ?? "", d.source_urls.join(" "),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => csvCell(String(c))).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `funding-pulse-deals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="filters">
        <input className="text" type="search" placeholder="Search company, investor, summary" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search deals" />
        <select className="text" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
          <option value="">All sectors</option>
          {sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="text" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage">
          <option value="">All stages</option>
          {stages.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="text" value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week">
          <option value="">All weeks</option>
          {weeks.map((w) => <option key={w} value={w}>Week of {w}</option>)}
        </select>
      </div>
      <div className="actions" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <label className="check" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" checked={focusOnly} onChange={(e) => setFocusOnly(e.target.checked)} /> Focus deals only
        </label>
        <span style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span className="hint" style={{ margin: 0 }}>{shown.length} of {deals.length} deals</span>
          <button className="ghost" onClick={exportCsv} disabled={shown.length === 0}>Export CSV</button>
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="empty">No deals match these filters.</div>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Company</th><th>Round</th><th>Amount</th><th>Lead</th><th>Sector</th><th>Week</th><th>Sources</th></tr>
            </thead>
            <tbody>
              {shown.map((d, i) => (
                <tr key={i}>
                  <td>
                    <b>{d.company_name}</b>
                    {d.relevance === "focus" && <span className="tag focus">Focus</span>}
                    {d.watchlist_hit && <span className="tag">Watchlist</span>}
                    {d.adjacent_to && <span className="tag">Adjacent</span>}
                    {d.one_line_summary && <div className="hint" style={{ margin: "2px 0 0" }}>{d.one_line_summary}</div>}
                  </td>
                  <td>{d.round_stage}</td>
                  <td style={{ minWidth: 150 }}>{amountOf(d)}</td>
                  <td>{d.lead_investor ?? "–"}</td>
                  <td>{d.sector ?? "–"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{d.week}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {d.source_urls.map((u, j) => (
                      <a key={j} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{j + 1}</a>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
