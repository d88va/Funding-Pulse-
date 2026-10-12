import { NextResponse } from "next/server";
import { patternsStage, reportWeek } from "@/lib/patterns";
import { checkNumbers } from "@/lib/numbercheck";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Latest stored stats and bullets for the report week.
export async function GET() {
  const [row] = await q<{ stats: unknown }>("select stats from briefs where week_start = $1::date", [reportWeek()]);
  return NextResponse.json(row?.stats ?? null);
}

// Stage 5. ?selftest=1 skips Gemini and shows the number check accepting a true sentence and rejecting
// deliberately broken ones, using the real stats. Nothing is saved.
export async function POST(req: Request) {
  try {
    if (new URL(req.url).searchParams.get("selftest") === "1") {
      const [row] = await q<{ stats: Record<string, unknown> }>("select stats from briefs where week_start = $1::date", [reportWeek()]);
      const stats = row?.stats;
      if (!stats) return NextResponse.json({ error: "Run stage 5 once first." }, { status: 400 });
      const total = Number(stats.total_deals);
      const cases = [
        `${total} deals were announced this week.`,
        `${total + 17} deals were announced this week.`,
        `Funding totalled ₹4,321 crore this week.`,
        `Deals doubled compared with last week.`,
      ];
      return NextResponse.json(cases.map((text) => ({ text, ...checkNumbers(text, stats) })));
    }
    return NextResponse.json(await patternsStage());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
