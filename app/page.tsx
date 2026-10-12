import { q } from "@/lib/db";
import { ensureSources, type Source } from "@/lib/sources";
import { fmtIST, weekOfLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureSources();
  const sources = await q<Source>("select * from sources where active order by id");
  const [counts] = await q<{ articles: string; candidates: string }>(
    `select count(*) as articles, count(*) filter (where is_funding_candidate) as candidates
     from articles where published_at > now() - interval '7 days'`
  );
  const [lastRun] = await q<{ finished_at: string | null }>(
    "select finished_at from runs where finished_at is not null order by started_at desc limit 1"
  );

  const isDown = (s: Source) => !!s.last_error || s.last_item_count === 0;
  const healthy = sources.filter((s) => s.last_fetched_at && !isDown(s)).length;
  const max = Math.max(1, ...sources.map((s) => s.last_item_count ?? 0));

  return (
    <main>
      <p className="kicker">Week of {weekOfLabel()} · Indian startup funding</p>
      <h1>
        Every deal, <em>counted</em> not guessed.
      </h1>
      <p className="deck">
        A Monday brief for venture scouts, built from live news. Amounts come from the source article. Trends are
        counted in code. Nothing is hidden.
      </p>

      <section className="figures" aria-label="This week at a glance">
        <div className="fig"><span className="n">{Number(counts.articles)}</span><span className="l">Articles read</span></div>
        <div className="fig"><span className="n">{Number(counts.candidates)}</span><span className="l">Funding candidates</span></div>
        <div className="fig">
          <span className={`n ${healthy < sources.length ? "bad" : ""}`}>{healthy}/{sources.length}</span>
          <span className="l">Sources healthy</span>
        </div>
        <div className="fig"><span className="n" style={{ fontSize: 22, lineHeight: 1.3 }}>{fmtIST(lastRun?.finished_at)}</span><span className="l">Last run, IST</span></div>
      </section>

      <div className="note">
        <b>The first brief is on its way</b>
        <p>
          The feeds below are live. Once deal extraction is switched on, this page becomes the brief: your focus
          deals, watchlist alerts and the week’s patterns, each with a link to its source.
        </p>
      </div>

      <h2>Sources checked this week</h2>
      <p className="sub">Articles each source returned. A source that returns nothing is flagged in red.</p>
      <ul className="srcs">
        {sources.map((s) => {
          const down = isDown(s);
          const n = s.last_item_count ?? 0;
          return (
            <li key={s.id} className={`src ${down ? "down" : ""}`}>
              <span>{s.name}</span>
              <span className="track"><span className="fill" style={{ width: `${Math.max(down ? 100 : 2, (n / max) * 100)}%` }} /></span>
              <span className="ct">{s.last_fetched_at ? n : "–"}</span>
              {s.last_error && <span className="why">Failed: {s.last_error}</span>}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
