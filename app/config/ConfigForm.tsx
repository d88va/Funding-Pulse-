"use client";

import { useState } from "react";
import { ROUNDS } from "@/lib/constants";

type Portfolio = { name: string; description: string };
type Initial = { sectors: string[]; stages: string[]; watchlist: string[]; portfolio: Portfolio[] };

function ChipInput({ label, hint, values, onChange, placeholder }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const v = raw.trim().replace(/,$/, "").trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="chips">
        {values.map((v) => (
          <span className="chip" key={v}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); }
            else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export default function ConfigForm({ initial, recipient }: { initial: Initial; recipient: string }) {
  const [sectors, setSectors] = useState(initial.sectors);
  const [stages, setStages] = useState(initial.stages);
  const [watchlist, setWatchlist] = useState(initial.watchlist);
  const [portfolio, setPortfolio] = useState<Portfolio[]>(initial.portfolio.length ? initial.portfolio : [{ name: "", description: "" }]);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "busy"; text: string } | null>(null);

  const body = () => JSON.stringify({ sectors, stages, watchlist, portfolio });
  const setRow = (i: number, patch: Partial<Portfolio>) => setPortfolio((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save(): Promise<boolean> {
    setMsg({ kind: "busy", text: "Saving…" });
    const res = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: body() });
    if (!res.ok) { setMsg({ kind: "bad", text: "Could not save. Please try again." }); return false; }
    setMsg({ kind: "ok", text: "Saved ✓ The next run will use these settings." });
    return true;
  }

  // Saves, then re-runs only the cheap stages so you can see the brief change straight away. Nothing is emailed.
  async function saveAndRebuild() {
    if (!(await save())) return;
    const portfolioChanged = JSON.stringify(portfolio.filter((p) => p.name.trim())) !== JSON.stringify(initial.portfolio);
    setMsg({ kind: "busy", text: "Saved. Rebuilding the brief…" });
    for (const url of [portfolioChanged ? "/api/relevance?redo=1" : "/api/relevance", "/api/patterns", "/api/brief"]) {
      const r = await fetch(url, { method: "POST" });
      if (!r.ok) { setMsg({ kind: "bad", text: `Saved, but rebuilding failed at ${url}.` }); return; }
    }
    setMsg({ kind: "ok", text: "Saved ✓ The brief on the home page now reflects your settings." });
  }

  return (
    <div>
      <ChipInput label="Focus sectors" values={sectors} onChange={setSectors} placeholder="Type a sector, press Enter" hint="Deals in these sectors, at your stages, become “focus deals”. Everything else goes under “Rest of the week”." />

      <div className="field">
        <label>Focus stages</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ROUNDS.filter((r) => r !== "Undisclosed").map((r) => (
            <button key={r} type="button" className={`toggle ${stages.includes(r) ? "on" : ""}`} aria-pressed={stages.includes(r)} onClick={() => setStages(stages.includes(r) ? stages.filter((s) => s !== r) : [...stages, r])}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <ChipInput label="Watchlist companies" values={watchlist} onChange={setWatchlist} placeholder="Type a company, press Enter" hint="Any deal involving these companies is flagged at the top of the brief. Matching ignores case and “Pvt Ltd”." />

      <div className="field">
        <label>Portfolio companies</label>
        {portfolio.map((p, i) => (
          <div className="prow" key={i}>
            <input className="text" placeholder="Company name" value={p.name} onChange={(e) => setRow(i, { name: e.target.value })} />
            <input className="text" placeholder="One line: what it does and for whom" value={p.description} onChange={(e) => setRow(i, { description: e.target.value })} />
            <button type="button" className="ghost" aria-label="Remove company" onClick={() => setPortfolio(portfolio.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => setPortfolio([...portfolio, { name: "", description: "" }])}>+ Add a portfolio company</button>
        <p className="hint">Gemini flags new deals that compete with or sit right next to these. The description is what it reads, so be specific.</p>
      </div>

      <div className="field">
        <label>Brief goes to</label>
        <input className="text" value={recipient} readOnly aria-readonly />
        <p className="hint">Set by the RECIPIENT_EMAIL environment variable. It is not editable here so that nobody can redirect the brief.</p>
      </div>

      <div className="actions">
        <button onClick={save} disabled={msg?.kind === "busy"}>Save</button>
        <button className="ghost" onClick={saveAndRebuild} disabled={msg?.kind === "busy"}>Save &amp; rebuild brief</button>
      </div>
      {msg && <p className={msg.kind === "ok" ? "saved" : msg.kind === "bad" ? "bad" : "hint"} role="status">{msg.text}</p>}
    </div>
  );
}
