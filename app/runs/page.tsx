import { q } from "@/lib/db";
import { fmtIST } from "@/lib/format";
import RunButton from "./RunButton";

export const dynamic = "force-dynamic";

type Run = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  articles_fetched: number;
  candidates: number;
  errors: unknown[];
};

export default async function Runs() {
  const runs = await q<Run>("select * from runs order by started_at desc limit 20");
  return (
    <main>
      <h1>Runs</h1>
      <p className="lede">Each run pulls the live feeds and records what every source returned.</p>
      <RunButton />
      <h2>History</h2>
      {runs.length === 0 ? (
        <div className="empty">No runs yet. Press “Fetch last 7 days”.</div>
      ) : (
        <table>
          <thead>
            <tr><th>Started (IST)</th><th>Status</th><th>Articles</th><th>Candidates</th><th>Errors</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{fmtIST(r.started_at)}</td>
                <td className={r.status === "error" ? "bad" : ""}>{r.status}</td>
                <td>{r.articles_fetched}</td>
                <td>{r.candidates}</td>
                <td className={r.errors.length ? "bad" : ""}>{r.errors.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
