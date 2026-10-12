import { q } from "@/lib/db";
import { ensureSources, type Source } from "@/lib/sources";
import { fmtIST } from "@/lib/format";
import { reportWeek } from "@/lib/patterns";
import BriefView from "@/components/BriefView";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureSources();
  const sources = await q<Source>("select * from sources where active order by id");
  const [lastRun] = await q<{ finished_at: string | null }>(
    "select finished_at from runs where finished_at is not null order by started_at desc limit 1"
  );
  const healthy = sources.filter((s) => s.last_fetched_at && !s.last_error && s.last_item_count !== 0).length;
  const status = `Updated ${fmtIST(lastRun?.finished_at)} · ${healthy} of ${sources.length} sources healthy`;

  const brief = await BriefView({ week: reportWeek(), status });
  return (
    <main>
      {brief ?? (
        <div className="issue">
          <p className="meta">No brief yet</p>
          <h1>The first brief is on its way.</h1>
          <p className="sum">Open Runs and press “Run pipeline now”. The brief will appear here.</p>
        </div>
      )}
    </main>
  );
}
