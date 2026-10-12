import { q } from "@/lib/db";
import { ensureSources, type Source } from "@/lib/sources";
import { fmtIST } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureSources();
  const sources = await q<Source>("select * from sources where active order by id");
  const [counts] = await q<{ articles: string; candidates: string }>(
    `select count(*) as articles, count(*) filter (where is_funding_candidate) as candidates
     from articles where published_at > now() - interval '7 days'`
  );
  const [lastRun] = await q<{ finished_at: string | null; status: string }>(
    "select finished_at, status from runs order by started_at desc limit 1"
  );
  const healthy = sources.filter((s) => (s.last_item_count ?? 0) > 0 && !s.last_error).length;

  return (
    <main>
      <h1>Indian startup funding, counted not guessed.</h1>
      <p className="lede">
        A weekly brief built from live news. The first brief appears here once the extraction stages are
        switched on. For now this page shows the live ingest.
      </p>

      <div className="strip">
        <span>Last run <b>{fmtIST(lastRun?.finished_at)}</b></span>
        <span>Articles (7 days) <b>{Number(counts.articles)}</b></span>
        <span>Funding candidates <b>{Number(counts.candidates)}</b></span>
        <span>Sources healthy <b>{healthy}/{sources.length}</b></span>
      </div>

      <h2>Sources checked</h2>
      <table>
        <thead>
          <tr><th>Source</th><th>Articles</th><th>Status</th></tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const bad = !!s.last_error || s.last_item_count === 0;
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className={bad ? "bad" : ""}>{s.last_item_count ?? "–"}</td>
                <td className={bad ? "bad" : "ok"}>
                  {s.last_fetched_at ? (s.last_error ? `failed: ${s.last_error}` : bad ? "returned 0" : "ok") : "not run yet"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
