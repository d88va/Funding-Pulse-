"use client";

import { useState } from "react";

type Step = { label: string; status: "running" | "done" | "skipped" | "error"; detail: string };

async function post(url: string) {
  const res = await fetch(url, { method: "POST" });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  return { status: res.status, body };
}

export default function RunButton() {
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  function setStep(i: number, s: Partial<Step>) {
    setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, ...s } : p)));
  }

  async function sendTest() {
    setBusy(true);
    setSteps([{ label: "Send test brief", status: "running", detail: "" }]);
    const r = await post("/api/brief?resend=1");
    if (r.body.error) setStep(0, { status: "error", detail: r.body.error });
    else setStep(0, { status: String(r.body.status).startsWith("sent") ? "done" : "error", detail: `${r.body.status} to ${r.body.to}` });
    setBusy(false);
  }

  async function run(days: number) {
    setBusy(true);
    setSteps([
      { label: "1. Ingest feeds", status: "running", detail: "" },
      { label: "2. Extract deals with Gemini", status: "running", detail: "waiting" },
      { label: "3. Verify, convert and merge (code)", status: "running", detail: "waiting" },
      { label: "4. Focus, watchlist and portfolio adjacency", status: "running", detail: "waiting" },
      { label: "5. Count patterns, narrate, number-check", status: "running", detail: "waiting" },
      { label: "6. Assemble the brief", status: "running", detail: "waiting" },
    ]);

    // Stage 1
    const ing = await post(`/api/ingest?days=${days}`);
    if (ing.status === 429) setStep(0, { status: "skipped", detail: "ran recently, using the articles already stored" });
    else if (ing.body.error) return fail(0, ing.body.error);
    else setStep(0, { status: "done", detail: `${ing.body.totals.articles} articles, ${ing.body.totals.added} new, ${ing.body.totals.candidates} look like funding news` });

    // Stage 2: repeat until nothing is left (each call stops before the time limit)
    let totalCalls = 0, totalDeals = 0, remaining = 1, stalls = 0;
    while (remaining > 0 && stalls < 3) {
      setStep(1, { status: "running", detail: `${totalCalls} Gemini calls so far, ${totalDeals} deals found` });
      const ex = await post("/api/extract");
      if (ex.body.error) return fail(1, ex.body.error);
      totalCalls += ex.body.geminiCalls;
      totalDeals += ex.body.dealsFound;
      stalls = ex.body.processed === 0 ? stalls + 1 : 0;
      remaining = ex.body.remaining;
      if (ex.body.errors?.length && ex.body.processed === 0) return fail(1, ex.body.errors[0]);
    }
    setStep(1, { status: remaining > 0 ? "error" : "done", detail: `${totalCalls} Gemini calls, ${totalDeals} deals found${remaining > 0 ? `, ${remaining} articles still waiting (press the button again)` : ""}` });

    // Stage 3
    setStep(2, { status: "running", detail: "working" });
    const ver = await post("/api/verify");
    if (ver.body.error) return fail(2, ver.body.error);
    setStep(2, { status: "done", detail: `${ver.body.dealsBuilt} new deals, ${ver.body.merged} merged duplicates, ${ver.body.verifiedAmounts} amounts verified, ${ver.body.undisclosed} undisclosed` });

    // Stage 4
    setStep(3, { status: "running", detail: "working" });
    const rel = await post("/api/relevance");
    if (rel.body.error) return fail(3, rel.body.error);
    setStep(3, {
      status: rel.body.errors?.length ? "error" : "done",
      detail: `${rel.body.focus} focus deals, ${rel.body.watchlistHits} watchlist hits, ${rel.body.adjacent} adjacent to your portfolio${rel.body.errors?.length ? `, but: ${rel.body.errors[0]}` : ""}`,
    });

    // Stage 5
    setStep(4, { status: "running", detail: "working" });
    const pat = await post("/api/patterns");
    if (pat.body.error) return fail(4, pat.body.error);
    setStep(4, {
      status: "done",
      detail: `${pat.body.bullets.length} pattern lines (${pat.body.source === "gemini" ? "Gemini text, every number verified" : "plain template: Gemini text failed the number check or was unavailable"})`,
    });

    // Stage 6 (builds and saves the brief; use "Send test brief" to email it)
    setStep(5, { status: "running", detail: "working" });
    const br = await post("/api/brief");
    if (br.body.error) return fail(5, br.body.error);
    setStep(5, { status: "done", detail: `brief for the week of ${br.body.weekStart} saved (${Math.round(br.body.htmlBytes / 1024)} KB)` });
    setBusy(false);

    function fail(i: number, msg: string) {
      setStep(i, { status: "error", detail: msg });
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="actions">
        <button disabled={busy} onClick={() => run(7)}>{busy ? "Running…" : "Run pipeline now (7 days)"}</button>
        <button className="ghost" disabled={busy} onClick={() => run(28)}>Backfill 4 weeks</button>
        <button className="ghost" disabled={busy} onClick={sendTest}>Send test brief</button>
        <a href="/api/brief" target="_blank" rel="noreferrer"><button type="button" className="ghost">Preview brief</button></a>
      </div>
      {steps.length > 0 && (
        <ul className="srcs">
          {steps.map((s) => (
            <li key={s.label} className="src" style={{ gridTemplateColumns: "1fr" }}>
              <span>
                <b>{s.label}</b>{" "}
                <span className={s.status === "error" ? "bad" : s.status === "done" ? "ok" : ""}>
                  {s.status === "running" ? "…" : s.status === "done" ? "✓" : s.status === "skipped" ? "–" : "✗"} {s.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
