import { NextResponse, after } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Hobby plan maximum

const MAX_RESUMES = 3;

// The Monday trigger. Vercel cron sends a GET with "Authorization: Bearer <CRON_SECRET>".
// Without the right secret nothing runs, so strangers cannot trigger it.
// ?send=0 runs everything except the email. ?days=N changes the window.
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const attempt = Number(url.searchParams.get("attempt")) || 0;
  const send = url.searchParams.get("send") !== "0";
  const days = Math.min(28, Math.max(1, Number(url.searchParams.get("days")) || 7));

  const result = await runPipeline({ days, send });

  // Out of time before finishing: start a fresh invocation, which resumes where this one stopped.
  if (!result.complete && result.steps.every((s) => s.stage !== "error") && attempt < MAX_RESUMES) {
    const next = new URL(req.url);
    next.searchParams.set("attempt", String(attempt + 1));
    after(async () => {
      await fetch(next, { headers: { authorization: `Bearer ${secret}` } }).catch(() => {});
    });
  }
  return NextResponse.json({ attempt, ...result });
}

export const GET = handle;
export const POST = handle;
