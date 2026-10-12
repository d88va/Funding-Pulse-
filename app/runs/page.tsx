import { q } from "@/lib/db";
import { fmtIST } from "@/lib/format";
import type { Source } from "@/lib/sources";
import RunButton from "./RunButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Runs · Funding Pulse" };

type Run = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  articles_fetched: number;
  candidates: number;
  deals_extracted: number;
  deals_after_dedupe: number;
  gemini_calls: number;
  errors: unknown[];
};

export default async function Runs() {
  const runs = await q<Run>("select * from runs order by started_at desc limit 20");
  const sources = await q<Source>("select * from sources order by id");
  return (
    <main>
      <p className="kicker">Pipeline</p>
      <h1>Runs.</h1>
      <p className="deck">Run the pipeline on live data and watch each stage. The Monday cron does the same thing automatically.</p>
      <p className="warn">This page has no password. Runs have a short cooldown, and emails are limited, so the link can be shared safely.</p>
      <RunButton />

      <h2>Source health</h2>
      <table>
        <thead><tr><th>Source</th><th>Last checked (IST)</th><th>Articles</th><th>Status</th></tr></thead>
        <tbody>
          {sources.map((s) => {
            const down = !!s.last_error || s.last_item_count === 0;
            return (
              <tr key={s.id}>
                <td>{s.name}{!s.active && <span className="hint"> (off)</span>}</td>
                <td>{fmtIST(s.last_fetched_at)}</td>
                <td className={down ? "bad" : ""}>{s.last_item_count ?? "–"}</td>
                <td className={down ? "bad" : "ok"}>{s.last_error ? `failed: ${s.last_error}` : !s.last_fetched_at ? "not run yet" : down ? "returned 0" : "ok"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>History</h2>
      {runs.length === 0 ? (
        <div className="empty">No runs yet.</div>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Started (IST)</th><th>Status</th><th>Articles</th><th>Candidates</th><th>Deals</th><th>Gemini calls</th><th>Errors</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{fmtIST(r.started_at)}</td>
                  <td className={r.status === "error" ? "bad" : ""}>{r.status}</td>
                  <td>{r.articles_fetched}</td>
                  <td>{r.candidates}</td>
                  <td>{r.deals_after_dedupe}</td>
                  <td>{r.gemini_calls}</td>
                  <td className={r.errors.length ? "bad" : ""}>{r.errors.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
