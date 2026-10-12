import { q } from "@/lib/db";
import { ensureSources, type Source } from "@/lib/sources";
import { fmtIST, weekOfLabel } from "@/lib/format";
import { reportWeek } from "@/lib/patterns";
import { bodyOf } from "@/lib/briefHtml";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureSources();
  const sources = await q<Source>("select * from sources where active order by id");
  const [counts] = await q<{ articles: string; deals: string }>(
    `select (select count(*) from articles where published_at > now() - interval '7 days') as articles,
            (select count(*) from deals) as deals`
  );
  const [lastRun] = await q<{ finished_at: string | null }>(
    "select finished_at from runs where finished_at is not null order by started_at desc limit 1"
  );
  const [brief] = await q<{ html: string; week_start: string }>(
    "select html, to_char(week_start,'YYYY-MM-DD') as week_start from briefs where week_start = $1::date and html <> ''",
    [reportWeek()]
  );

  const isDown = (s: Source) => !!s.last_error || s.last_item_count === 0;
  const healthy = sources.filter((s) => s.last_fetched_at && !isDown(s)).length;

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

      <section className="figures" aria-label="Status">
        <div className="fig"><span className="n">{Number(counts.deals)}</span><span className="l">Deals in the log</span></div>
        <div className="fig"><span className="n">{Number(counts.articles)}</span><span className="l">Articles read, 7 days</span></div>
        <div className="fig">
          <span className={`n ${healthy < sources.length ? "bad" : ""}`}>{healthy}/{sources.length}</span>
          <span className="l">Sources healthy</span>
        </div>
        <div className="fig"><span className="n" style={{ fontSize: 22, lineHeight: 1.3 }}>{fmtIST(lastRun?.finished_at)}</span><span className="l">Last run, IST</span></div>
      </section>

      {brief ? (
        <div className="brief" dangerouslySetInnerHTML={{ __html: bodyOf(brief.html) }} />
      ) : (
        <div className="note">
          <b>The first brief is on its way</b>
          <p>Run the pipeline from the Runs page and the brief appears here: your focus deals, watchlist alerts and the week’s patterns, each with a link to its source.</p>
        </div>
      )}
    </main>
  );
}
