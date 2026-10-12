import { NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COOLDOWN_MINUTES = 5;

// Stage 1 endpoint. Public pages can trigger it, so a cooldown stops strangers from
// hammering the feeds. The cron job sends CRON_SECRET and skips the cooldown.
export async function POST(req: Request) {
  const isCron = !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    const recent = await q<{ started_at: string }>(
      `select started_at from runs where started_at > now() - interval '${COOLDOWN_MINUTES} minutes' limit 1`
    );
    if (recent.length > 0) {
      return NextResponse.json(
        { error: `A run started in the last ${COOLDOWN_MINUTES} minutes. Please wait.` },
        { status: 429 }
      );
    }
  }

  const days = Math.min(28, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  try {
    return NextResponse.json(await ingest(days));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
