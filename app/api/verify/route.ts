import { NextResponse } from "next/server";
import { verifyStage } from "@/lib/normalize";
import { q, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Stage 3. Pure code: verifies amounts against the article text, converts currency, merges duplicates.
export async function POST(req: Request) {
  try {
    // ?redo=1 re-checks every article from scratch (safe: merging is idempotent). Used after fixing a parsing rule.
    if (new URL(req.url).searchParams.get("redo") === "1") {
      await ensureSchema();
      await q("update articles set normalized = false where extraction is not null");
    }
    return NextResponse.json(await verifyStage());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
