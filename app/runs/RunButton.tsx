"use client";

import { useState } from "react";

type Result = {
  error?: string;
  totals?: { articles: number; added: number; candidates: number };
  sources?: { name: string; articles: number; added: number; candidates: number; error: string | null }[];
};

export default function RunButton() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(days: number) {
    setBusy(`${days}d`);
    setResult(null);
    try {
      const res = await fetch(`/api/ingest?days=${days}`, { method: "POST" });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Request failed" });
    }
    setBusy(null);
  }

  return (
    <div>
      <div className="actions">
        <button disabled={!!busy} onClick={() => run(7)}>{busy === "7d" ? "Fetching…" : "Fetch last 7 days"}</button>
        <button className="ghost" disabled={!!busy} onClick={() => run(28)}>{busy === "28d" ? "Fetching…" : "Backfill 4 weeks"}</button>
      </div>
      {result?.error && <p className="bad">{result.error}</p>}
      {result?.totals && (
        <p>
          Stage 1 done: <b>{result.totals.articles}</b> articles in window, <b>{result.totals.added}</b> new,{" "}
          <b>{result.totals.candidates}</b> look like funding news. Reload the page to see source health.
        </p>
      )}
    </div>
  );
}
