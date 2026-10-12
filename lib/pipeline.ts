import { q } from "./db";
import { ingest } from "./ingest";
import { extractStage } from "./extract";
import { verifyStage } from "./normalize";
import { relevanceStage } from "./relevance";
import { patternsStage, reportWeek } from "./patterns";
import { buildBrief } from "./brief";
import { sendBrief } from "./email";

export type PipelineResult = {
  complete: boolean; // false means time ran out; call again and it resumes (every stage is idempotent)
  steps: { stage: string; ok: boolean; detail: string }[];
  emailed: string | null;
  seconds: number;
};

const SAFETY_MS = 30_000; // leave room to wrap up before the platform's time limit

async function finish(status: string, errors: unknown[]) {
  await q(
    `update runs set status = $1, finished_at = now(), errors = $2
     where id = (select id from runs order by started_at desc limit 1)`,
    [status, JSON.stringify(errors)]
  );
}

// The whole Monday run, stage by stage: Ingest, Extract, Verify, Relevance, Patterns, Brief, Send.
// Every stage reads from and writes to the database and skips work already done, so a run that stops
// part-way can simply be started again.
export async function runPipeline(opts: { days?: number; send?: boolean; budgetMs?: number } = {}): Promise<PipelineResult> {
  const start = Date.now();
  const deadline = start + (opts.budgetMs ?? 270_000);
  const steps: PipelineResult["steps"] = [];
  const done = (stage: string, detail: string) => steps.push({ stage, ok: true, detail });
  const result = (complete: boolean, emailed: string | null = null): PipelineResult => ({
    complete, steps, emailed, seconds: Math.round((Date.now() - start) / 1000),
  });

  try {
    const ing = await ingest(opts.days ?? 7);
    done("ingest", `${ing.totals.articles} articles, ${ing.totals.added} new, ${ing.totals.candidates} candidates`);

    // Extract in rounds until nothing is waiting, or until time is nearly up.
    let remaining = 1;
    let calls = 0;
    while (remaining > 0 && Date.now() < deadline - SAFETY_MS) {
      const ex = await extractStage(Math.min(200_000, deadline - Date.now() - SAFETY_MS));
      calls += ex.geminiCalls;
      remaining = ex.remaining;
      if (ex.processed === 0) {
        if (ex.errors.length) steps.push({ stage: "extract", ok: false, detail: ex.errors[0].slice(0, 200) });
        break;
      }
    }
    if (remaining > 0) {
      steps.push({ stage: "extract", ok: false, detail: `${remaining} articles still waiting after ${calls} Gemini calls` });
      await finish("partial", steps.filter((s) => !s.ok));
      return result(false);
    }
    done("extract", `${calls} Gemini calls`);

    const ver = await verifyStage();
    done("verify", `${ver.dealsBuilt} new deals, ${ver.merged} merged, ${ver.verifiedAmounts} amounts verified`);

    const rel = await relevanceStage();
    done("relevance", `${rel.focus} focus, ${rel.watchlistHits} watchlist, ${rel.adjacent} adjacent`);

    const pat = await patternsStage();
    done("patterns", `${pat.bullets.length} bullets from ${pat.source}`);

    const brief = await buildBrief();
    done("brief", `${Math.round(brief.html.length / 1024)} KB`);

    let emailed: string | null = null;
    if (opts.send !== false) {
      // Never send the same week twice if the run is restarted.
      const [already] = await q<{ n: string }>(
        "select count(*) as n from briefs where week_start = $1::date and email_status like 'sent%' and sent_at > now() - interval '12 hours'",
        [reportWeek()]
      );
      if (Number(already.n) > 0) done("send", "skipped: this week's brief was already emailed in the last 12 hours");
      else {
        const sent = await sendBrief(brief.subject, brief.html, brief.weekStart);
        emailed = sent.status;
        steps.push({ stage: "send", ok: sent.status.startsWith("sent"), detail: `${sent.status} to ${sent.to}` });
      }
    }
    await finish("complete", steps.filter((s) => !s.ok));
    return result(true, emailed);
  } catch (e) {
    steps.push({ stage: "error", ok: false, detail: e instanceof Error ? e.message : String(e) });
    await finish("error", steps.filter((s) => !s.ok)).catch(() => {});
    return result(false);
  }
}
