import { NextResponse } from "next/server";
import { buildBrief } from "@/lib/brief";
import { sendBrief, resendLatest } from "@/lib/email";
import { q } from "@/lib/db";
import { reportWeek } from "@/lib/patterns";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COOLDOWN_MINUTES = 5;

// Preview: the latest brief as a web page, exactly the HTML that gets emailed.
export async function GET() {
  const [b] = await q<{ html: string }>("select html from briefs where week_start = $1::date", [reportWeek()]);
  if (!b?.html) return new NextResponse("No brief built yet.", { status: 404 });
  return new NextResponse(b.html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

// Stage 6. Builds the brief and saves it. ?send=1 also emails it; ?resend=1 re-sends the stored copy.
// Emailing has a cooldown so a public page cannot flood the inbox; the cron job (with CRON_SECRET) skips it.
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const wantsSend = url.searchParams.get("send") === "1" || url.searchParams.get("resend") === "1";
    const isCron = !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

    if (wantsSend && !isCron) {
      const recent = await q(
        `select 1 from briefs where sent_at > now() - interval '${COOLDOWN_MINUTES} minutes' limit 1`
      );
      if (recent.length) {
        return NextResponse.json({ error: `An email was sent in the last ${COOLDOWN_MINUTES} minutes. Please wait.` }, { status: 429 });
      }
    }

    if (url.searchParams.get("resend") === "1") return NextResponse.json(await resendLatest());

    const built = await buildBrief();
    const out: Record<string, unknown> = { weekStart: built.weekStart, subject: built.subject, htmlBytes: built.html.length };
    if (url.searchParams.get("send") === "1") out.email = await sendBrief(built.subject, built.html, built.weekStart);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
