import { NextResponse } from "next/server";
import { verifyStage } from "@/lib/normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Stage 3. Pure code: verifies amounts against the article text, converts currency, merges duplicates.
export async function POST() {
  try {
    return NextResponse.json(await verifyStage());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
